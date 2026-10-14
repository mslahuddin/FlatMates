import React, {useEffect, useState} from 'react';
import {
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
import {parseAmountToPence, splitEqual} from '../../libs/money';
import {createExpense, expenseErrorMessage} from '../../services/expense';
import type {Member} from '../../services/flat';
import {useColors} from '../../theme';

/**
 * Money forms: Add expense and Add bill, plus the bill writes to Firestore.
 * The Money screen only has to render <AddExpenseModal /> and <AddBillModal />.
 */

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
const OWE_COLOR = '#EBA24F';
const CARD_BORDER = 'rgba(255,255,255,0.12)';

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

/**
 * Waits up to 6 seconds for the server. If it has not confirmed (offline),
 * resolves queued: true. Firestore keeps the write and sends it later.
 */
async function confirmOrQueue(write: Promise<unknown>) {
  const outcome = await Promise.race([
    write.then(() => 'saved' as const),
    new Promise<'queued'>(resolve => setTimeout(() => resolve('queued'), 6000)),
  ]);
  if (outcome === 'queued') {
    write.catch(() => {});
  }
  return {queued: outcome === 'queued'};
}

export function billErrorMessage(e: unknown): string {
  if ((e as {code?: string})?.code === 'invalid-input') {
    return 'Check the name and amount, then try again.';
  }
  return expenseErrorMessage(e);
}

/** Saves a recurring bill, split equally between participantIds. */
export async function createBill(input: {
  flatId: string;
  name: string;
  amountPence: number;
  frequency: Frequency;
  nextDue: Date;
  paidBy: string;
  participantIds: string[];
}) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  const name = input.name.trim();
  const {amountPence, frequency, nextDue, paidBy, participantIds} = input;
  if (
    !name ||
    !Number.isInteger(amountPence) ||
    amountPence <= 0 ||
    participantIds.length === 0 ||
    !participantIds.includes(paidBy)
  ) {
    throw fail('invalid-input');
  }

  const ref = doc(collection(db, 'flats', input.flatId, 'bills'));
  const shares = splitEqual(amountPence, participantIds, ref.id);
  if (Object.values(shares).reduce((sum, s) => sum + s, 0) !== amountPence) {
    throw fail('invalid-input');
  }

  return confirmOrQueue(
    setDoc(ref, {
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
    }),
  );
}

/**
 * "Mark as paid": adds an expense for this bill and moves the bill to its next
 * due date, in one atomic write. The expense id is built from the bill and the
 * due date, so tapping twice for the same due date cannot add it twice.
 */
export async function markBillPaid(flatId: string, bill: Bill) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  const due = atNoon(bill.nextDue);
  const key = `${due.getFullYear()}${String(due.getMonth() + 1).padStart(
    2,
    '0',
  )}${String(due.getDate()).padStart(2, '0')}`;

  const batch = writeBatch(db);
  batch.set(doc(db, 'flats', flatId, 'expenses', `${bill.id}_${key}`), {
    description: bill.name,
    amountPence: bill.amountPence,
    currency: 'GBP',
    paidBy: bill.paidBy,
    participantIds: bill.participantIds,
    shares: bill.shares,
    splitMethod: 'equal',
    date: Timestamp.fromDate(due),
    billId: bill.id,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    deletedAt: null,
  });
  batch.update(doc(db, 'flats', flatId, 'bills', bill.id), {
    nextDue: Timestamp.fromDate(addFrequency(due, bill.frequency)),
    lastPaidAt: serverTimestamp(),
  });
  return confirmOrQueue(batch.commit());
}

/** Stops a bill from showing. The history it created stays. */
export async function deleteBill(flatId: string, billId: string) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'flats', flatId, 'bills', billId), {
    deletedAt: serverTimestamp(),
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

const FieldCard = ({
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
          error ? s.fieldError : active && {borderColor: colors.lightGreen},
        ]}>
        <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{label}</Text>
        {children}
      </View>
      {error ? (
        <Text style={s.errorText} accessibilityRole="alert">
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
              style={[s.chip, selected && {borderColor: colors.lightGreen}]}>
              {selected ? (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    {backgroundColor: colors.lightGreen, opacity: 0.16},
                  ]}
                />
              ) : null}
              <MemberAvatar name={member.name} index={index} size={wp(8)} />
              <Text
                style={[
                  s.chipText,
                  {color: selected ? colors.white : colors.surfaceAlt},
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

/** A date row that opens an inline calendar when tapped. */
const DateField = ({
  label,
  date,
  onChange,
  maximumDate,
}: {
  label: string;
  date: Date;
  onChange: (d: Date) => void;
  maximumDate?: Date;
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
        <Text style={[s.dateText, {color: colors.white}]}>
          {formatDate(date)}
        </Text>
        <Icon
          name={open ? 'expand-less' : 'event'}
          size={wp(6)}
          color={colors.lightGreen}
        />
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          maximumDate={maximumDate}
          themeVariant="dark"
          accentColor={colors.lightGreen}
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
const Sheet = ({
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
            <Icon name="chevron-left" size={wp(7)} color={colors.lightGreen} />
            <Text style={[s.cancelText, {color: colors.lightGreen}]}>
              Cancel
            </Text>
          </Pressable>

          <Text style={[s.title, {color: colors.white}]}>{title}</Text>

          {children}

          {formError ? (
            <Text style={s.errorText} accessibilityRole="alert">
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
              {backgroundColor: colors.lightGreen},
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
  const [date, setDate] = useState(new Date());
  const [focus, setFocus] = useState<'amount' | 'description' | null>(null);

  const [amountError, setAmountError] = useState<string | undefined>();
  const [descriptionError, setDescriptionError] = useState<
    string | undefined
  >();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start fresh every time the modal opens.
  useEffect(() => {
    if (visible) {
      setAmountText('');
      setDescription('');
      setPaidBy(me);
      setDate(new Date());
      setAmountError(undefined);
      setDescriptionError(undefined);
      setFormError(null);
      setSaving(false);
    }
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
        participantIds: members.map(member => member.id),
        date,
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
            selectionColor={colors.lightGreen}
            keyboardType="decimal-pad"
            maxLength={10}
            autoFocus
            accessibilityLabel="Amount in pounds"
            style={[s.amountInput, {color: colors.white}]}
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
          selectionColor={colors.lightGreen}
          autoCapitalize="sentences"
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel="Description"
          style={[s.input, {color: colors.white}]}
        />
      </FieldCard>

      <PaidByField
        members={members}
        me={me}
        value={paidBy}
        onChange={setPaidBy}
      />

      <DateField
        label="DATE"
        date={date}
        onChange={setDate}
        maximumDate={new Date()}
      />

      <Text style={[s.hint, {color: colors.textMuted}]}>
        Split equally between everyone in the flat for now. Choosing who to
        split with comes next.
      </Text>
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
  const [focus, setFocus] = useState<'name' | 'amount' | null>(null);

  const [nameError, setNameError] = useState<string | undefined>();
  const [amountError, setAmountError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setAmountText('');
      setFrequency('monthly');
      setNextDue(new Date());
      setPaidBy(me);
      setNameError(undefined);
      setAmountError(undefined);
      setFormError(null);
      setSaving(false);
    }
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
        participantIds: members.map(member => member.id),
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
          selectionColor={colors.lightGreen}
          autoCapitalize="sentences"
          maxLength={40}
          autoFocus
          returnKeyType="next"
          accessibilityLabel="Bill name"
          style={[s.input, {color: colors.white}]}
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
            selectionColor={colors.lightGreen}
            keyboardType="decimal-pad"
            maxLength={10}
            accessibilityLabel="Amount in pounds"
            style={[s.input, s.flex, {color: colors.white}]}
          />
        </View>
      </FieldCard>

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

      <FieldCard label="SPLIT">
        <Text style={[s.input, {color: colors.white}]}>
          {`Equally between ${members.length}`}
        </Text>
      </FieldCard>
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
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: wp(4.5),
    paddingVertical: hp(1.4),
    gap: hp(0.6),
  },
  fieldError: {borderColor: OWE_COLOR, backgroundColor: '#3A2A17'},
  fieldLabel: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  errorText: {
    color: OWE_COLOR,
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
    borderColor: CARD_BORDER,
    paddingVertical: hp(0.6),
    paddingLeft: wp(1.5),
    paddingRight: wp(3.5),
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