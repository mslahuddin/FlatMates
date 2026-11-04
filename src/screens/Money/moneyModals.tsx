import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from '@react-native-firebase/firestore';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import DateTimePicker from '@react-native-community/datetimepicker';
import {MemberAvatar} from '../../components/memberAvatar';
import {SegmentedControl} from '../../components/segmentedControl';
import {formatPence, parseAmountToPence, splitEqual} from '../../libs/money';
import {
  addReceiptToBatch,
  confirmOrQueue,
  createExpense,
  expenseErrorMessage,
} from '../../services/expense';
import type {ReceiptDraft} from '../../services/expense';
import {pickReceipt, receiptErrorMessage} from './Receipts';
import type {Member} from '../../services/flat';
import {useColors , MONO} from '../../theme';


/**
 * Money forms: Add expense and Add bill, plus the bill writes to Firestore.
 * The Money screen only has to render <AddExpenseModal /> and <AddBillModal />.
 */




/* ============================================================
 * Bill types and Firestore writes
 * ============================================================ */

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const FREQUENCIES: {value: Frequency; label: string}[] = [
  {value: 'weekly', label: 'Weekly'},
  {value: 'monthly', label: 'Monthly'},
  {value: 'yearly', label: 'Yearly'},
];

/** A recurring bill as the app uses it. nextDue is already a Date. */
export type Bill = {
  id: string;
  name: string;
  amountPence: number;
  frequency: Frequency;
  nextDue: Date;
  paidBy: string;
  participantIds: string[];
  /** uid -> pence. Always adds up to amountPence. */
  shares: Record<string, number>;
  /** Who added the bill. Only they can delete it. */
  createdBy: string;
  /** Receipt photo kept with the bill and copied to each expense it makes. */
  receiptId: string | null;
};

const db = getFirestore();

const fail = (code: string) => Object.assign(new Error(code), {code});

/** Noon on that day, so the date never shifts with time zones. */
const atNoon = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);

/** The next due date after `d`. Month ends are respected (31 Jan -> 28 Feb). */
export function addFrequency(d: Date, frequency: Frequency): Date {
  if (frequency === 'weekly') {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, 12);
  }
  const months = frequency === 'monthly' ? 1 : 12;
  const total = d.getMonth() + months;
  const year = d.getFullYear() + Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), lastDay), 12);
}

export function billErrorMessage(e: unknown): string {
  if ((e as {code?: string})?.code === 'invalid-input') {
    return 'Check the name and amount, then try again.';
  }
  return expenseErrorMessage(e);
}

/** Saves a recurring bill, split equally between participantIds (the payer need not be one of them). */
export async function createBill(input: {
  flatId: string;
  name: string;
  amountPence: number;
  frequency: Frequency;
  nextDue: Date;
  paidBy: string;
  participantIds: string[];
  receipt?: ReceiptDraft | null;
}) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  const name = input.name.trim();
  const {amountPence, frequency, nextDue, paidBy} = input;
  const participantIds = Array.from(new Set(input.participantIds));
  if (
    !name ||
    !Number.isInteger(amountPence) ||
    amountPence <= 0 ||
    participantIds.length === 0 ||
    !paidBy
  ) {
    throw fail('invalid-input');
  }

  const ref = doc(collection(db, 'flats', input.flatId, 'bills'));
  const shares = splitEqual(amountPence, participantIds, ref.id);
  if (Object.values(shares).reduce((sum, s) => sum + s, 0) !== amountPence) {
    throw fail('invalid-input');
  }

  const data = {
    name,
    amountPence,
    currency: 'GBP',
    frequency,
    nextDue: Timestamp.fromDate(atNoon(nextDue)),
    paidBy,
    participantIds,
    shares,
    splitMethod: 'equal',
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    deletedAt: null,
  };

  let write: Promise<unknown>;
  if (input.receipt) {
    const batch = writeBatch(db);
    const receiptId = addReceiptToBatch(
      batch,
      input.flatId,
      input.receipt,
      user.uid,
    );
    batch.set(ref, {...data, receiptId});
    write = batch.commit();
  } else {
    write = setDoc(ref, {...data, receiptId: null});
  }
  return confirmOrQueue(write);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 20261015 -- part of the expense id, so one due date can only become one expense. */
const dueKey = (d: Date) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

/** Queues the expense for one due date of a bill. Shares are the bill's own shares. */
function addBillExpense(
  batch: ReturnType<typeof writeBatch>,
  flatId: string,
  bill: Bill,
  due: Date,
  uid: string,
) {
  batch.set(doc(db, 'flats', flatId, 'expenses', `${bill.id}_${dueKey(due)}`), {
    description: bill.name,
    amountPence: bill.amountPence,
    currency: 'GBP',
    paidBy: bill.paidBy,
    participantIds: bill.participantIds,
    shares: bill.shares,
    splitMethod: 'equal',
    date: Timestamp.fromDate(due),
    billId: bill.id,
    receiptId: bill.receiptId ?? null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    deletedAt: null,
  });
}

/**
 * "Add to expenses now": turns the bill's next due date into an expense (so it
 * is split in balances) and moves the bill to the following due date, in one
 * atomic write. The expense id is built from the bill and the due date, so the
 * same due date can never be added twice.
 */
export async function markBillPaid(flatId: string, bill: Bill) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  const due = atNoon(bill.nextDue);
  const batch = writeBatch(db);
  addBillExpense(batch, flatId, bill, due, user.uid);
  batch.update(doc(db, 'flats', flatId, 'bills', bill.id), {
    nextDue: Timestamp.fromDate(addFrequency(due, bill.frequency)),
    lastPaidAt: serverTimestamp(),
  });
  return confirmOrQueue(batch.commit());
}

/** Bills being written right now, so the same bill is not written twice. */
const inFlight = new Set<string>();

/**
 * Call this when the bills load. Every bill whose due date is today or earlier
 * becomes an expense (split between its people, so balances update) and moves to
 * its next due date. Missed cycles are caught up, at most 24 at a time. Safe to
 * call many times, from any phone: the expense ids stop duplicates.
 */
export async function materialiseDueBills(flatId: string, bills: Bill[]) {
  const user = getAuth().currentUser;
  if (!user) {
    return;
  }
  const now = new Date();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  for (const bill of bills) {
    let due = atNoon(bill.nextDue);
    if (due.getTime() > endOfToday.getTime()) {
      continue;
    }
    const key = `${bill.id}_${bill.nextDue.getTime()}`;
    if (inFlight.has(key)) {
      continue;
    }

    const batch = writeBatch(db);
    let cycles = 0;
    while (due.getTime() <= endOfToday.getTime() && cycles < 24) {
      addBillExpense(batch, flatId, bill, due, user.uid);
      due = addFrequency(due, bill.frequency);
      cycles++;
    }
    batch.update(doc(db, 'flats', flatId, 'bills', bill.id), {
      nextDue: Timestamp.fromDate(due),
      lastPaidAt: serverTimestamp(),
    });

    inFlight.add(key);
    batch
      .commit()
      .catch(e => {
        // Try again the next time the bills change.
        inFlight.delete(key);
        console.warn('Could not add a due bill to expenses', e);
      });
  }
}

/** Stops a bill from showing. The history it created stays. */
export async function deleteBill(flatId: string, billId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'flats', flatId, 'bills', billId), {
    // A real timestamp (not a server one), so it also hides the bill at once offline.
    deletedAt: Timestamp.now(),
  });
  return confirmOrQueue(batch.commit());
}

/* ============================================================
 * Shared form pieces
 * ============================================================ */

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "Today, 12 Oct 2026", "Yesterday, 11 Oct 2026" or "3 Oct 2026". */
const formatDate = (d: Date) => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const text = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (sameDay(d, now)) {
    return `Today, ${text}`;
  }
  return sameDay(d, yesterday) ? `Yesterday, ${text}` : text;
};

/** Keeps digits and one dot, with at most two decimals, while the user types. */
const cleanAmount = (text: string) => {
  const t = text.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = t.split('.');
  if (rest.length === 0) {
    return whole.slice(0, 7);
  }
  return `${whole.slice(0, 7)}.${rest.join('').slice(0, 2)}`;
};

export const FieldCard = ({
  label,
  active,
  error,
  children,
}: {
  label: string;
  active?: boolean;
  error?: string;
  children: React.ReactNode;
}) => {
  const colors = useColors();

  return (
    <View>
      <View
        style={[
          s.field,
          {
            backgroundColor: colors.card,
            borderColor: error
              ? colors.warning
              : active
                ? colors.accent
                : colors.cardBorder,
          },
          error && s.fieldError,
        ]}>
        <Text style={[s.fieldLabel, {color: colors.textMuted}]}>
          {label}
        </Text>
        {children}
      </View>

      {error ? (
        <Text
          style={[s.errorText, {color: colors.warning}]}
          accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const PaidByField = ({
  members,
  me,
  value,
  onChange,
}: {
  members: Member[];
  me: string;
  value: string;
  onChange: (uid: string) => void;
}) => {
  const colors = useColors();
  return (
    <FieldCard label="PAID BY">
      <View style={s.chips}>
        {members.map((member, index) => {
          const selected = member.id === value;
          return (
            <Pressable
              key={member.id}
              onPress={() => onChange(member.id)}
              accessibilityRole="radio"
              accessibilityState={{selected}}
              accessibilityLabel={`${member.name}${
                member.id === me ? ', you' : ''
              }`}
              style={[s.chip, {borderColor: colors.cardBorder,}, selected && {borderColor: colors.accent}]}>
              {selected ? (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {backgroundColor: colors.accent, opacity: 0.16},
                  ]}
                />
              ) : null}
              <MemberAvatar name={member.name} index={index} size={wp(8)} />
              <Text
                style={[
                  s.chipText,
                  {color: selected ? colors.text : colors.textSecondary},
                  selected && s.chipTextSelected,
                ]}>
                {member.name}
                {member.id === me ? ' (you)' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldCard>
  );
};

/** Optional receipt photo: take one with the camera or pick one from the gallery. */
const ReceiptField = ({
  value,
  onChange,
}: {
  value: ReceiptDraft | null;
  onChange: (receipt: ReceiptDraft | null) => void;
}) => {
  const colors = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const pick = async (source: 'camera' | 'library') => {
    if (busy) {
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const picked = await pickReceipt(source);
      if (picked) {
        onChange(picked);
      }
    } catch (e) {
      setError(receiptErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const Option = ({
    icon,
    label,
    source,
  }: {
    icon: string;
    label: string;
    source: 'camera' | 'library';
  }) => (
    <Pressable
      onPress={() => pick(source)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [s.receiptButton, {borderColor: colors.cardBorder , backgroundColor: colors.chip}, pressed && s.pressed]}>
      <Icon name={icon} size={wp(5.5)} color={colors.accent} />
      <Text style={[s.receiptButtonText, {color: colors.text}]}>{label}</Text>
    </Pressable>
  );

  return (
    <FieldCard label="RECEIPT · OPTIONAL" error={error}>
      {value ? (
        <View style={s.receiptRow}>
          <Image
            source={{uri: `data:${value.mime};base64,${value.base64}`}}
            style={s.receiptPreview}
            resizeMode="cover"
            accessibilityLabel="Receipt photo"
          />
          <View style={s.flex}>
            <Text style={[s.input, {color: colors.text}]}>Receipt added</Text>
            <Pressable
              onPress={() => pick('camera')}
              hitSlop={wp(2)}
              accessibilityRole="button">
              <Text style={[s.receiptLink, {color: colors.accent}]}>
                Retake
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={wp(3)}
            accessibilityRole="button"
            accessibilityLabel="Remove receipt">
            <Icon name="close" size={wp(6)} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : busy ? (
        <ActivityIndicator color={colors.accent} style={s.receiptBusy} />
      ) : (
        <View style={s.receiptOptions}>
          <Option icon="photo-camera" label="Camera" source="camera" />
          <Option icon="photo-library" label="Gallery" source="library" />
        </View>
      )}
    </FieldCard>
  );
};

export const SplitChip = ({
  on,
  label,
  onPress,
  children,
  a11y,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
  children?: React.ReactNode;
  a11y: string;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{checked: on}}
      accessibilityLabel={a11y}
      style={[s.chip ,{borderColor: colors.cardBorder,}, on && {borderColor: colors.accent}]}>
      {on ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {backgroundColor: colors.accent, opacity: 0.16},
          ]}
        />
      ) : null}
      {children}
      <Text
        style={[
          s.chipText,
          {color: on ? colors.text : colors.textSecondary},
          on && s.chipTextSelected,
        ]}>
        {label}
      </Text>
      {on ? (
        <Icon name="check" size={wp(4.5)} color={colors.accent} />
      ) : null}
    </Pressable>
  );
};

/**
 * Who the cost is split between: a sideways list of flatmates. Tap to include or
 * leave out. "Everyone" selects the whole flat. The payer can be left out (for
 * example when you buy something just for two others).
 */
const SplitField = ({
  members,
  me,
  paidBy,
  selected,
  onChange,
  amountPence,
  error,
}: {
  members: Member[];
  me: string;
  paidBy: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  amountPence: number | null;
  error?: string;
}) => {
  const colors = useColors();
  const allSelected =
    members.length > 0 && members.every(m => selected.includes(m.id));

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id],
    );

  // What each person pays. A leftover penny means some pay 1p more.
  const count = selected.length;
  let each = '';
  if (count > 0 && amountPence && amountPence > 0) {
    const base = Math.floor(amountPence / count);
    each =
      amountPence % count === 0
        ? ` · ${formatPence(base)} each`
        : ` · about ${formatPence(Math.round(amountPence / count))} each`;
  }
  const payerLeftOut = count > 0 && !selected.includes(paidBy);

  return (
    <FieldCard label="SPLIT BETWEEN" error={error}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.splitRow}>
        <SplitChip
          on={allSelected}
          label="Everyone"
          a11y="Everyone in the flat"
          onPress={() => onChange(members.map(m => m.id))}>
          <View style={[s.everyoneIcon, {borderColor: colors.cardBorder}]}>
            <Icon name="groups" size={wp(5)} color={colors.accent} />
          </View>
        </SplitChip>
        {members.map((member, index) => (
          <SplitChip
            key={member.id}
            on={selected.includes(member.id)}
            label={`${member.name}${member.id === me ? ' (you)' : ''}`}
            a11y={`${member.name}${member.id === me ? ', you' : ''}`}
            onPress={() => toggle(member.id)}>
            <MemberAvatar name={member.name} index={index} size={wp(8)} />
          </SplitChip>
        ))}
      </ScrollView>
      <Text style={[s.splitHint, {color: colors.textMuted}]}>
        {count === 0
          ? 'Pick at least one person'
          : `Equally between ${count} ${count === 1 ? 'person' : 'people'}${each}${
              payerLeftOut ? ' · payer not included' : ''
            }`}
      </Text>
    </FieldCard>
  );
};

/** A date row that opens an inline calendar when tapped. */
export const DateField = ({
  label,
  date,
  onChange,
  maximumDate,
  minimumDate,
}: {
  label: string;
  date: Date;
  onChange: (d: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
}) => {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <FieldCard label={label} active={open}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatDate(date)}. Change date`}
        style={s.dateRow}>
        <Text style={[s.dateText, {color: colors.text}]}>
          {formatDate(date)}
        </Text>
        <Icon
          name={open ? 'expand-less' : 'event'}
          size={wp(6)}
          color={colors.accent}
        />
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          themeVariant="dark"
          accentColor={colors.accent}
          onChange={(event, selected) => {
            if (Platform.OS !== 'ios') {
              setOpen(false);
            }
            if (event.type === 'dismissed' || !selected) {
              return;
            }
            onChange(selected);
            if (Platform.OS === 'ios') {
              setOpen(false);
            }
          }}
        />
      ) : null}
    </FieldCard>
  );
};

/** Page sheet with a Cancel link, a title, scrolling fields and a pinned button. */
export const Sheet = ({
  visible,
  onClose,
  title,
  buttonLabel,
  busyLabel,
  saving,
  onSubmit,
  formError,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  buttonLabel: string;
  busyLabel: string;
  saving: boolean;
  onSubmit: () => void;
  formError: string | null;
  children: React.ReactNode;
}) => {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[s.sheet, {backgroundColor: colors.background}]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={onClose}
            hitSlop={wp(3)}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={s.cancel}>
            <Icon name="chevron-left" size={wp(7)} color={colors.accent} />
            <Text style={[s.cancelText, {color: colors.accent}]}>
              Cancel
            </Text>
          </Pressable>

          <Text style={[s.title, {color: colors.text}]}>{title}</Text>

          {children}

          {formError ? (
            <Text style={[s.errorText, {color: colors.warning}]} accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={s.footer}>
          <Pressable
            onPress={onSubmit}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            style={({pressed}) => [
              s.button,
              {backgroundColor: colors.accent},
              (pressed || saving) && s.pressed,
            ]}>
            <Text style={[s.buttonText, {color: colors.black}]}>
              {saving ? busyLabel : buttonLabel}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  flatId: string;
  members: Member[];
  /** The signed-in user's id. They are selected as the payer by default. */
  me: string;
};

/* ============================================================
 * Add expense
 * ============================================================ */

export const AddExpenseModal = ({
  visible,
  onClose,
  flatId,
  members,
  me,
}: ModalProps) => {
  const colors = useColors();

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState(me);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const [date, setDate] = useState(new Date());
  const [focus, setFocus] = useState<'amount' | 'description' | null>(null);

  const [amountError, setAmountError] = useState<string | undefined>();
  const [descriptionError, setDescriptionError] = useState<
    string | undefined
  >();
  const [splitError, setSplitError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start fresh every time the modal opens.
  useEffect(() => {
    if (visible) {
      setAmountText('');
      setDescription('');
      setPaidBy(me);
      setSplitWith(members.map(member => member.id));
      setReceipt(null);
      setDate(new Date());
      setAmountError(undefined);
      setDescriptionError(undefined);
      setSplitError(undefined);
      setFormError(null);
      setSaving(false);
    }
    // Only reset when the modal opens, not when the members list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, me]);

  const onSubmit = async () => {
    if (saving) {
      return;
    }
    setFormError(null);

    const amountPence = parseAmountToPence(amountText);
    let valid = true;
    if (!amountPence || amountPence <= 0) {
      setAmountError('Enter an amount greater than £0.00.');
      valid = false;
    }
    if (!description.trim()) {
      setDescriptionError('Add a short description.');
      valid = false;
    }
    // Only people who are still in the flat can be in the split.
    const participantIds = splitWith.filter(id =>
      members.some(member => member.id === id),
    );
    if (participantIds.length === 0) {
      setSplitError('Pick at least one person to split with.');
      valid = false;
    }
    if (!valid || !amountPence) {
      return;
    }

    try {
      setSaving(true);
      await createExpense({
        flatId,
        description,
        amountPence,
        paidBy,
        participantIds,
        date,
        receipt,
      });
      onClose();
    } catch (e) {
      setFormError(expenseErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add expense"
      buttonLabel="Add expense"
      busyLabel="Adding…"
      saving={saving}
      onSubmit={onSubmit}
      formError={formError}>
      <FieldCard
        label="AMOUNT"
        active={focus === 'amount'}
        error={amountError}>
        <View style={s.amountRow}>
          <Text style={[s.currency, {color: colors.textMuted}]}>£</Text>
          <TextInput
            value={amountText}
            onChangeText={text => {
              setAmountText(cleanAmount(text));
              setAmountError(undefined);
              setFormError(null);
            }}
            onFocus={() => setFocus('amount')}
            onBlur={() => setFocus(null)}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            keyboardType="decimal-pad"
            maxLength={10}
            autoFocus
            accessibilityLabel="Amount in pounds"
            style={[s.amountInput, {color: colors.text}]}
          />
        </View>
      </FieldCard>

      <FieldCard
        label="DESCRIPTION"
        active={focus === 'description'}
        error={descriptionError}>
        <TextInput
          value={description}
          onChangeText={text => {
            setDescription(text);
            setDescriptionError(undefined);
            setFormError(null);
          }}
          onFocus={() => setFocus('description')}
          onBlur={() => setFocus(null)}
          placeholder="Weekly groceries, pizza night"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCapitalize="sentences"
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="Description"
          style={[s.input, {color: colors.text}]}
        />
      </FieldCard>

      <ReceiptField value={receipt} onChange={setReceipt} />

      <PaidByField
        members={members}
        me={me}
        value={paidBy}
        onChange={setPaidBy}
      />

      <SplitField
        members={members}
        me={me}
        paidBy={paidBy}
        selected={splitWith}
        onChange={ids => {
          setSplitWith(ids);
          setSplitError(undefined);
          setFormError(null);
        }}
        amountPence={parseAmountToPence(amountText)}
        error={splitError}
      />

      <DateField
        label="DATE"
        date={date}
        onChange={setDate}
        maximumDate={new Date()}
      />
    </Sheet>
  );
};

/* ============================================================
 * Add bill
 * ============================================================ */

export const AddBillModal = ({
  visible,
  onClose,
  flatId,
  members,
  me,
}: ModalProps) => {
  const colors = useColors();

  const [name, setName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDue, setNextDue] = useState(new Date());
  const [paidBy, setPaidBy] = useState(me);
  const [splitWith, setSplitWith] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const [focus, setFocus] = useState<'name' | 'amount' | null>(null);

  const [nameError, setNameError] = useState<string | undefined>();
  const [amountError, setAmountError] = useState<string | undefined>();
  const [splitError, setSplitError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setAmountText('');
      setFrequency('monthly');
      setNextDue(new Date());
      setPaidBy(me);
      setSplitWith(members.map(member => member.id));
      setReceipt(null);
      setNameError(undefined);
      setAmountError(undefined);
      setSplitError(undefined);
      setFormError(null);
      setSaving(false);
    }
    // Only reset when the modal opens, not when the members list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, me]);

  const onSubmit = async () => {
    if (saving) {
      return;
    }
    setFormError(null);

    const amountPence = parseAmountToPence(amountText);
    let valid = true;
    if (!name.trim()) {
      setNameError('Give the bill a name, like Internet or Rent.');
      valid = false;
    }
    if (!amountPence || amountPence <= 0) {
      setAmountError('Enter an amount greater than £0.00.');
      valid = false;
    }
    const participantIds = splitWith.filter(id =>
      members.some(member => member.id === id),
    );
    if (participantIds.length === 0) {
      setSplitError('Pick at least one person to split with.');
      valid = false;
    }
    if (!valid || !amountPence) {
      return;
    }

    try {
      setSaving(true);
      await createBill({
        flatId,
        name,
        amountPence,
        frequency,
        nextDue,
        paidBy,
        participantIds,
        receipt,
      });
      onClose();
    } catch (e) {
      setFormError(billErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add bill"
      buttonLabel="Save bill"
      busyLabel="Saving…"
      saving={saving}
      onSubmit={onSubmit}
      formError={formError}>
      <FieldCard
        label="BILL NAME"
        active={focus === 'name'}
        error={nameError}>
        <TextInput
          value={name}
          onChangeText={text => {
            setName(text);
            setNameError(undefined);
            setFormError(null);
          }}
          onFocus={() => setFocus('name')}
          onBlur={() => setFocus(null)}
          placeholder="Internet, rent, electricity"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          autoCapitalize="sentences"
          maxLength={40}
          autoFocus
          returnKeyType="next"
          accessibilityLabel="Bill name"
          style={[s.input, {color: colors.text}]}
        />
      </FieldCard>

      <FieldCard
        label="AMOUNT"
        active={focus === 'amount'}
        error={amountError}>
        <View style={s.amountRow}>
          <Text style={[s.input, {color: colors.textMuted}]}>£</Text>
          <TextInput
            value={amountText}
            onChangeText={text => {
              setAmountText(cleanAmount(text));
              setAmountError(undefined);
              setFormError(null);
            }}
            onFocus={() => setFocus('amount')}
            onBlur={() => setFocus(null)}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            keyboardType="decimal-pad"
            maxLength={10}
            accessibilityLabel="Amount in pounds"
            style={[s.input, s.flex, {color: colors.text}]}
          />
        </View>
      </FieldCard>

      <ReceiptField value={receipt} onChange={setReceipt} />

      <SegmentedControl
        options={FREQUENCIES}
        value={frequency}
        onChange={setFrequency}
      />

      <DateField label="NEXT DUE" date={nextDue} onChange={setNextDue} />

      <PaidByField
        members={members}
        me={me}
        value={paidBy}
        onChange={setPaidBy}
      />

      <SplitField
        members={members}
        me={me}
        paidBy={paidBy}
        selected={splitWith}
        onChange={ids => {
          setSplitWith(ids);
          setSplitError(undefined);
          setFormError(null);
        }}
        amountPence={parseAmountToPence(amountText)}
        error={splitError}
      />

      <Text style={[s.hint, {color: colors.textMuted}]}>
        On the due date this is added to Expenses and split between the people you
        picked in Balances. A bill due today is added straight away.
      </Text>
    </Sheet>
  );
};

/* ============================================================
 * Styles
 * ============================================================ */

const s = StyleSheet.create({
  
  sheet: {flex: 1},
  flex: {flex: 1},
  content: {
    paddingHorizontal: wp(6),
    paddingTop: hp(2.4),
    paddingBottom: hp(2),
    gap: hp(1.6),
  },
  cancel: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -wp(1.5),
  },
  cancelText: {fontSize: 17, fontWeight: '600'},
  title: {fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6},

  field: {
    borderRadius: wp(5),
    borderWidth: 1,
   
    paddingHorizontal: wp(4.5),
    paddingVertical: hp(1.4),
    gap: hp(0.6),
  },
  fieldError: { backgroundColor: '#3A2A17'},
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  errorText: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: hp(0.8),
  },

  amountRow: {flexDirection: 'row', alignItems: 'center', gap: wp(1)},
  currency: {fontSize: 44, fontWeight: '700'},
  amountInput: {
    flex: 1,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -1,
    paddingVertical: 0,
  },
  input: {fontSize: 20, fontWeight: '500', paddingVertical: hp(0.4)},

  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: wp(2.5)},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(2),
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: 1,
    
    paddingVertical: hp(0.6),
    paddingLeft: wp(1.5),
    paddingRight: wp(3.5),
  },
  splitRow: {flexDirection: 'row', alignItems: 'center', gap: wp(2.5)},
  splitHint: {fontSize: 15, lineHeight: 21, marginTop: hp(0.4)},
  everyoneIcon: {
    width: wp(8),
    height: wp(8),
    borderRadius: wp(4),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {fontSize: 17, fontWeight: '500'},
  chipTextSelected: {fontWeight: '700'},

  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: hp(0.4),
  },
  dateText: {fontSize: 20, fontWeight: '500'},

  hint: {fontSize: 15, lineHeight: 21},

  receiptOptions: {flexDirection: 'row', gap: wp(3), paddingVertical: hp(0.4)},
  receiptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(2),
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: hp(1.2),
  },
  receiptButtonText: {fontSize: 17, fontWeight: '600'},
  receiptRow: {flexDirection: 'row', alignItems: 'center', gap: wp(3.5)},
  receiptPreview: {
    width: wp(15),
    height: wp(15),
    borderRadius: wp(3),
    backgroundColor: 'colors.chip)',
  },
  receiptLink: {fontSize: 16, fontWeight: '600', marginTop: 2},
  receiptBusy: {paddingVertical: hp(1.2)},

  footer: {paddingHorizontal: wp(6), paddingBottom: hp(3), paddingTop: hp(1)},
  button: {
    minHeight: 52,
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {fontSize: 17, fontWeight: '700'},
  pressed: {opacity: 0.7},
});