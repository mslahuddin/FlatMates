import React, {useEffect, useState} from 'react';
import {
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
  updateDoc,
  serverTimestamp,
  deleteField,
  Timestamp,
} from '@react-native-firebase/firestore';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {MemberAvatar} from '../../components/memberAvatar';
import {
  DateField,
  FieldCard,
  Sheet,
  SplitChip,
} from '../Money/moneyModals';
import {confirmOrQueue, expenseErrorMessage} from '../../services/expense';
import type {Member} from '../../services/flat';
import {useColors} from '../../theme';

/**
 * Duties: the Assign duty form and the Firestore writes.
 * Duties live at flats/{flatId}/duties/{dutyId}.
 */

const db = getFirestore();

/* ============================================================
 * Types and writes
 * ============================================================ */

/** A duty as the app uses it. */
export type Duty = {
  id: string;
  title: string;
  description: string;
  /** End of the deadline day. */
  deadline: Date;
  assignedTo: string[];
  /** Uids of the assigned people who have marked it done. */
  doneBy: string[];
  createdBy: string;
};

const fail = (code: string) => Object.assign(new Error(code), {code});

export function dutyErrorMessage(e: unknown): string {
  switch ((e as {code?: string})?.code) {
    case 'not-owner':
      return 'Only the flat owner can assign duties.';
    case 'invalid-input':
      return 'Give the duty a name and pick at least one person.';
    case 'firestore/permission-denied':
      return "You don't have permission to do that. Only the flat owner can assign or delete duties, and you can only tick off your own.";
    default:
      return expenseErrorMessage(e);
  }
}

/** The deadline is a calendar day. It runs out at the end of that day. */
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

/** Assigns a duty. Only the flat owner can do this (the rules check it too). */
export async function createDuty(input: {
  flatId: string;
  ownerId: string;
  title: string;
  description: string;
  deadline: Date;
  assignedTo: string[];
}) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  if (user.uid !== input.ownerId) {
    throw fail('not-owner');
  }
  const title = input.title.trim();
  const description = input.description.trim();
  const assignedTo = Array.from(new Set(input.assignedTo));
  if (
    !title ||
    title.length > 60 ||
    description.length > 200 ||
    assignedTo.length === 0 ||
    Number.isNaN(input.deadline.getTime())
  ) {
    throw fail('invalid-input');
  }

  const ref = doc(collection(db, 'flats', input.flatId, 'duties'));
  return confirmOrQueue(
    setDoc(ref, {
      title,
      description,
      deadline: Timestamp.fromDate(endOfDay(input.deadline)),
      assignedTo,
      doneBy: {},
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      deletedAt: null,
    }),
  );
}

/** Ticks or unticks the signed-in person's own box on a duty. */
export async function setDutyDone(
  flatId: string,
  dutyId: string,
  done: boolean,
) {
  const user = getAuth().currentUser;
  if (!user) {
    throw fail('not-signed-in');
  }
  return confirmOrQueue(
    updateDoc(doc(db, 'flats', flatId, 'duties', dutyId), {
      [`doneBy.${user.uid}`]: done ? Timestamp.now() : deleteField(),
    }),
  );
}

/** Removes a duty. It is marked deleted, not erased. Owner only. */
export async function deleteDuty(flatId: string, dutyId: string) {
  if (!getAuth().currentUser) {
    throw fail('not-signed-in');
  }
  return confirmOrQueue(
    updateDoc(doc(db, 'flats', flatId, 'duties', dutyId), {
      // A real timestamp, so the duty also disappears at once when offline.
      deletedAt: Timestamp.now(),
    }),
  );
}

/* ============================================================
 * Assign duty form
 * ============================================================ */

type Props = {
  visible: boolean;
  onClose: () => void;
  flatId: string;
  /** The flat owner's uid. Only they can assign duties. */
  ownerId: string;
  members: Member[];
  me: string;
};

const startOfToday = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

const tomorrow = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 12);
};

export const AddDutyModal = ({
  visible,
  onClose,
  flatId,
  ownerId,
  members,
  me,
}: Props) => {
  const colors = useColors();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(tomorrow());
  const [assigned, setAssigned] = useState<string[]>([]);
  const [focus, setFocus] = useState<'title' | 'description' | null>(null);

  const [titleError, setTitleError] = useState<string | undefined>();
  const [assignError, setAssignError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDescription('');
      setDeadline(tomorrow());
      setAssigned([]);
      setTitleError(undefined);
      setAssignError(undefined);
      setFormError(null);
      setSaving(false);
    }
  }, [visible]);

  const allSelected =
    members.length > 0 && members.every(m => assigned.includes(m.id));

  const toggle = (id: string) => {
    setAssignError(undefined);
    setFormError(null);
    setAssigned(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const onSubmit = async () => {
    if (saving) {
      return;
    }
    setFormError(null);

    let valid = true;
    if (!title.trim()) {
      setTitleError('Give the duty a name, like Clean the kitchen.');
      valid = false;
    }
    // Only people who are still in the flat can be given a duty.
    const assignedTo = assigned.filter(id => members.some(m => m.id === id));
    if (assignedTo.length === 0) {
      setAssignError('Pick at least one person.');
      valid = false;
    }
    if (!valid) {
      return;
    }

    try {
      setSaving(true);
      await createDuty({
        flatId,
        ownerId,
        title,
        description,
        deadline,
        assignedTo,
      });
      onClose();
    } catch (e) {
      setFormError(dutyErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Assign duty"
      buttonLabel="Assign duty"
      busyLabel="Assigning…"
      saving={saving}
      onSubmit={onSubmit}
      formError={formError}>
      <FieldCard
        label="DUTY NAME"
        active={focus === 'title'}
        error={titleError}>
        <TextInput
          value={title}
          onChangeText={text => {
            setTitle(text);
            setTitleError(undefined);
            setFormError(null);
          }}
          onFocus={() => setFocus('title')}
          onBlur={() => setFocus(null)}
          placeholder="Clean the kitchen, take the bins out"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.lightGreen}
          autoCapitalize="sentences"
          maxLength={60}
          autoFocus
          returnKeyType="next"
          accessibilityLabel="Duty name"
          style={[d.input, {color: colors.white}]}
        />
      </FieldCard>

      <FieldCard
        label="DESCRIPTION · OPTIONAL"
        active={focus === 'description'}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          onFocus={() => setFocus('description')}
          onBlur={() => setFocus(null)}
          placeholder="Wipe the surfaces, empty the dishwasher…"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.lightGreen}
          autoCapitalize="sentences"
          maxLength={200}
          multiline
          accessibilityLabel="Description, optional"
          style={[d.input, d.multiline, {color: colors.white}]}
        />
      </FieldCard>

      <DateField
        label="DEADLINE"
        date={deadline}
        onChange={setDeadline}
        minimumDate={startOfToday()}
      />

      <FieldCard label="ASSIGN TO" error={assignError}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={d.row}>
          <SplitChip
            on={allSelected}
            label="Everyone"
            a11y="Everyone in the flat"
            onPress={() =>
              setAssigned(allSelected ? [] : members.map(m => m.id))
            }>
            <View style={d.everyoneIcon}>
              <Icon name="groups" size={wp(5)} color={colors.lightGreen} />
            </View>
          </SplitChip>
          {members.map((member, index) => (
            <SplitChip
              key={member.id}
              on={assigned.includes(member.id)}
              label={`${member.name}${member.id === me ? ' (you)' : ''}`}
              a11y={`${member.name}${member.id === me ? ', you' : ''}`}
              onPress={() => toggle(member.id)}>
              <MemberAvatar name={member.name} index={index} size={wp(8)} />
            </SplitChip>
          ))}
        </ScrollView>
        <Text style={[d.hint, {color: colors.textMuted}]}>
          {assigned.length === 0
            ? 'Pick who needs to do it'
            : `Assigned to ${assigned.length} ${
                assigned.length === 1 ? 'person' : 'people'
              }. Each one ticks it off themselves.`}
        </Text>
      </FieldCard>
    </Sheet>
  );
};

const d = StyleSheet.create({
  input: {fontSize: 20, fontWeight: '500', paddingVertical: hp(0.4)},
  multiline: {minHeight: hp(9), textAlignVertical: 'top'},
  row: {flexDirection: 'row', alignItems: 'center', gap: wp(2.5)},
  everyoneIcon: {
    width: wp(8),
    height: wp(8),
    borderRadius: wp(4),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {fontSize: 15, lineHeight: 21, marginTop: hp(0.4)},
});