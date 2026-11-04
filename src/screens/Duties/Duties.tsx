import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {useNavigation} from '@react-navigation/native';
import {EmptyState} from '../../components/emptyState';
import {MemberAvatar} from '../../components/memberAvatar';
import {SegmentedControl} from '../../components/segmentedControl';
import {useFlat} from '../../hooks/useFlat';
import type {Member} from '../../services/flat';
import {useColors , MONO} from '../../theme';
import {AddDutyModal, deleteDuty, dutyErrorMessage, setDutyDone} from './dutyModals';
import type {Duty} from './dutyModals';



type Tab = 'mine' | 'all' | 'done';

const TABS: {value: Tab; label: string}[] = [
  {value: 'mine', label: 'Mine'},
  {value: 'all', label: 'All'},
  {value: 'done', label: 'Done'},
];



/** Red = deadline passed. Orange = deadline close. Green = done. */



/** A duty counts as "due soon" when its deadline is today or within this many days. */
const SOON_DAYS = 2;

/* ---------- Status ---------- */

type Status = 'done' | 'overdue' | 'soon' | 'open';

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from today to the deadline day. 0 = today, negative = passed. */
const daysUntil = (d: Date, now: Date) =>
  Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);

/** Everyone who still has to tick it, i.e. assigned people who are still in the flat. */
const requiredPeople = (duty: Duty, members: Member[]) =>
  duty.assignedTo.filter(uid => members.some(m => m.id === uid));

const dutyStatus = (duty: Duty, members: Member[], now: Date): Status => {
  const required = requiredPeople(duty, members);
  if (required.length > 0 && required.every(uid => duty.doneBy.includes(uid))) {
    return 'done';
  }
  if (now.getTime() > duty.deadline.getTime()) {
    return 'overdue';
  }
  return daysUntil(duty.deadline, now) <= SOON_DAYS ? 'soon' : 'open';
};

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});

const dueText = (status: Status, deadline: Date, now: Date) => {
  const days = daysUntil(deadline, now);
  if (status === 'done') {
    return `Done · was due ${shortDate(deadline)}`;
  }
  if (status === 'overdue') {
    return `Overdue by ${plural(Math.max(1, -days))} · ${shortDate(deadline)}`;
  }
  if (days === 0) {
    return `Due today · ${shortDate(deadline)}`;
  }
  if (days === 1) {
    return `Due tomorrow · ${shortDate(deadline)}`;
  }
  return `Due in ${plural(days)} · ${shortDate(deadline)}`;
};



/** Most urgent first: overdue, due soon, open, then done. */
const ORDER: Record<Status, number> = {overdue: 0, soon: 1, open: 2, done: 3};

/* ---------- Live data ---------- */

const toDate = (value: unknown): Date => {
  const v = value as {toDate?: () => Date} | null | undefined;
  return v && typeof v.toDate === 'function' ? v.toDate() : new Date();
};

/** Live list of the flat's duties. Deleted ones are left out. */
function useDuties(flatId: string | undefined) {
  const [state, setState] = useState<{
    loading: boolean;
    error: boolean;
    duties: Duty[];
  }>({loading: !!flatId, error: false, duties: []});

  useEffect(() => {
    if (!flatId) {
      setState({loading: false, error: false, duties: []});
      return;
    }
    setState(prev => ({...prev, loading: true, error: false}));
    const unsubscribe = onSnapshot(
      collection(getFirestore(), 'flats', flatId, 'duties'),
      snap => {
        const duties = snap.docs
          .map(d => {
            const data = d.data() as Record<string, any>;
            if (data.deletedAt) {
              return null;
            }
            const doneMap = (data.doneBy ?? {}) as Record<string, unknown>;
            return {
              id: d.id,
              title: data.title ?? 'Duty',
              description: data.description ?? '',
              deadline: toDate(data.deadline),
              assignedTo: (data.assignedTo ?? []) as string[],
              doneBy: Object.keys(doneMap).filter(uid => !!doneMap[uid]),
              createdBy: data.createdBy ?? '',
            } as Duty;
          })
          .filter((x): x is Duty => x !== null);
        setState({loading: false, error: false, duties});
      },
      () => setState({loading: false, error: true, duties: []}),
    );
    return unsubscribe;
  }, [flatId]);

  return state;
}

/* ---------- Small building blocks ---------- */

const Label = ({text}: {text: string}) => {
  const colors = useColors();
  return <Text style={[s.label, {color: colors.textMuted}]}>{text}</Text>;
};

const AddButton = ({onPress}: {onPress: () => void}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Assign duty"
      style={({pressed}) => [
        s.addButton,
        {backgroundColor: colors.accent},
        pressed && s.pressed,
      ]}>
      <Icon name="add" size={wp(8)} color={colors.black} />
    </Pressable>
  );
};

/** Red when you can delete it, grey and disabled when you can't. */
const DeleteButton = ({
  enabled,
  onPress,
  label,
}: {
  enabled: boolean;
  onPress: () => void;
  label: string;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={wp(1.5)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled: !enabled}}
      style={({pressed}) => [
        s.deleteButton,
        enabled ? {backgroundColor: colors.dangerBg} : s.deleteDisabled,
        pressed && s.pressed,
      ]}>
      <Icon
        name="delete-outline"
        size={wp(5.5)}
        color={enabled ? colors.danger : colors.textMuted}
      />
    </Pressable>
  );
};

const Stat = ({value, label, color}: {value: number; label: string; color: string}) => {
  const colors = useColors();
  return (
    <View style={s.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text style={[s.statValue, {color}]}>{value}</Text>
      <Text style={[s.statLabel, {color: colors.textMuted}]}>{label}</Text>
    </View>
  );
};

type DutyCardProps = {
  duty: Duty;
  status: Status;
  now: Date;
  members: Member[];
  me: string;
  isOwner: boolean;
  busy: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
};

const DutyCard = ({
  duty,
  status,
  now,
  members,
  me,
  isOwner,
  busy,
  onToggleDone,
  onDelete,
}: DutyCardProps) => {
const colors = useColors();

const tone = {
  open: {
    accent: colors.divider,
    border: colors.cardBorder,
    bg: colors.card,
    label: null,
  },
  soon: {
    accent: colors.warning,
    border: 'rgba(235,162,79,0.45)',
    bg: colors.warningBg,
    label: 'DUE SOON',
  },
  overdue: {
    accent: colors.danger,
    border: 'rgba(229,103,91,0.5)',
    bg: colors.dangerBg,
    label: 'OVERDUE',
  },
  done: {
    accent: colors.success,
    border: 'rgba(123,201,143,0.4)',
    bg: colors.successBg,
    label: 'DONE',
  },
}[status];
  const required = requiredPeople(duty, members);
  const doneCount = required.filter(uid => duty.doneBy.includes(uid)).length;
  const iAmAssigned = duty.assignedTo.includes(me);
  const iDidIt = duty.doneBy.includes(me);
  const dueColor = status === 'open' ? colors.textMuted : tone.accent;

  return (
    <View
      style={[s.card, {backgroundColor: tone.bg, borderColor: tone.border}]}>
      <View style={[s.bar, {backgroundColor: tone.accent}]} />

      <View style={s.cardTop}>
        <Text
          style={[s.cardTitle, {color: colors.text}]}
          numberOfLines={2}>
          {duty.title}
        </Text>
        {tone.label ? (
          <View style={[s.pill, {borderColor: tone.accent}]}>
            <Text style={[s.pillText, {color: tone.accent}]}>{tone.label}</Text>
          </View>
        ) : null}
      </View>

      {duty.description ? (
        <Text
          style={[s.description, {color: colors.textSecondary}]}
          numberOfLines={3}>
          {duty.description}
        </Text>
      ) : null}

      <View style={s.dueRow}>
        <Icon
          name={status === 'done' ? 'check-circle' : 'event'}
          size={wp(4.8)}
          color={dueColor}
        />
        <Text style={[s.dueText, {color: dueColor}]}>
          {dueText(status, duty.deadline, now)}
        </Text>
      </View>

      <View style={s.people}>
        <View style={s.avatars}>
          {duty.assignedTo.map(uid => {
            const index = members.findIndex(m => m.id === uid);
            const name = members[index]?.name ?? 'Former flatmate';
            const done = duty.doneBy.includes(uid);
            return (
              <View key={uid} style={s.avatarWrap}>
                <MemberAvatar name={name} index={Math.max(0, index)} size={wp(9.5)} />
                {done ? (
                  <View style={[s.tick, {backgroundColor: colors.success}]}>
                    <Icon name="check" size={wp(3)} color="#0F1A14" />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={[s.progress, {color: colors.textMuted}]}>
          {doneCount} of {required.length} done
        </Text>
      </View>

      <View style={s.actions}>
        {iAmAssigned ? (
          <Pressable
            onPress={onToggleDone}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={iDidIt ? 'Undo done' : 'Mark as done'}
            style={({pressed}) => [
              s.doneButton,
              iDidIt
                ? {borderColor: colors.success, backgroundColor: 'rgba(123,201,143,0.14)'}
                : {borderColor: colors.accent, backgroundColor: colors.accent},
              (pressed || busy) && s.pressed,
            ]}>
            <Icon
              name={iDidIt ? 'check-circle' : 'check'}
              size={wp(5)}
              color={iDidIt ? colors.success : colors.black}
            />
            <Text
              style={[s.doneText, {color: iDidIt ? colors.success : colors.black}]}>
              {iDidIt ? 'Done · tap to undo' : 'Mark as done'}
            </Text>
          </Pressable>
        ) : (
          <Text style={[s.notYours, {color: colors.textMuted}]}>
            Not assigned to you
          </Text>
        )}
        <DeleteButton
          enabled={isOwner}
          onPress={onDelete}
          label={`Delete ${duty.title}`}
        />
      </View>
    </View>
  );
};

/* ---------- Screen ---------- */

const Duties = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('mine');

  const {loading: flatLoading, error: flatError, flat, members} = useFlat();
  const {loading: dutiesLoading, error: dutiesError, duties} = useDuties(flat?.id);

  const me = getAuth().currentUser?.uid ?? '';
  const isOwner = !!flat && flat.ownerId === me;
  const ownerName = members.find(m => m.id === flat?.ownerId)?.name ?? 'the owner';

  // Re-check deadlines every minute, so a duty turns red as soon as its day ends.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return duties
      .map(duty => ({duty, status: dutyStatus(duty, members, now)}))
      .sort((a, b) =>
        a.status === 'done' && b.status === 'done'
          ? b.duty.deadline.getTime() - a.duty.deadline.getTime()
          : ORDER[a.status] - ORDER[b.status] ||
            a.duty.deadline.getTime() - b.duty.deadline.getTime(),
      );
  }, [duties, members, now]);

  const counts = useMemo(
    () => ({
      overdue: rows.filter(r => r.status === 'overdue').length,
      soon: rows.filter(r => r.status === 'soon').length,
      done: rows.filter(r => r.status === 'done').length,
    }),
    [rows],
  );

  const visible = rows.filter(r => {
    if (tab === 'done') {
      return r.status === 'done';
    }
    if (tab === 'mine') {
      return r.status !== 'done' && r.duty.assignedTo.includes(me);
    }
    return true;
  });

  const toggleDone = async (duty: Duty) => {
    if (!flat || busyId) {
      return;
    }
    try {
      setBusyId(duty.id);
      await setDutyDone(flat.id, duty.id, !duty.doneBy.includes(me));
    } catch (e) {
      Alert.alert("Couldn't update the duty", dutyErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (duty: Duty) => {
    if (!flat) {
      return;
    }
    Alert.alert(
      'Delete this duty?',
      `${duty.title}\n\nIt is removed for everyone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDuty(flat.id, duty.id);
            } catch (e) {
              Alert.alert("Couldn't delete the duty", dutyErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  const renderList = () => {
    if (duties.length === 0) {
      return (
        <EmptyState
          icon="check-box"
          title="No duties yet"
          description={
            isOwner
              ? 'Assign a chore to your flatmates, like cleaning the kitchen or taking the bins out.'
              : `${ownerName} assigns the flat's duties. They will show up here.`
          }
          actionLabel={isOwner ? 'Assign duty' : undefined}
          onAction={isOwner ? () => setAdding(true) : undefined}
        />
      );
    }
    if (visible.length === 0) {
      return tab === 'done' ? (
        <EmptyState
          icon="hourglass-empty"
          title="Nothing completed yet"
          description="Duties show up here once everyone assigned has ticked them off."
        />
      ) : (
        <EmptyState
          icon="celebration"
          title="You're all caught up"
          description="No duties waiting for you right now."
        />
      );
    }
    return visible.map(({duty, status}) => (
      <DutyCard
        key={duty.id}
        duty={duty}
        status={status}
        now={now}
        members={members}
        me={me}
        isOwner={isOwner}
        busy={busyId === duty.id}
        onToggleDone={() => toggleDone(duty)}
        onDelete={() => confirmDelete(duty)}
      />
    ));
  };

  const renderBody = () => {
    if (flatLoading || (flat && dutiesLoading)) {
      return <ActivityIndicator color={colors.accent} style={s.loader} />;
    }
    if (flatError || dutiesError) {
      return (
        <EmptyState
          icon="cloud-off"
          title="Couldn't load duties"
          description="Check your connection and try again."
        />
      );
    }
    if (!flat) {
      return (
        <EmptyState
          icon="home"
          title="No flat yet"
          description="Create or join a flat to share duties with your flatmates."
          actionLabel="Go to dashboard"
          onAction={() => navigation.navigate('Home')}
        />
      );
    }
    return (
      <>
        {duties.length > 0 ? (
         <View
  style={[
    s.summary,
    {
      borderColor: colors.cardBorder,
      backgroundColor: colors.card,
    },
  ]}>
            <Stat value={counts.overdue} label="overdue" color={colors.danger} />
         <View style={[s.divider, {backgroundColor: colors.divider}]} />
            <Stat value={counts.soon} label="due soon" color={colors.warning} />
           <View style={[s.divider, {backgroundColor: colors.divider}]} />
            <Stat value={counts.done} label="done" color={colors.success} />
          </View>
        ) : null}

        {!isOwner ? (
          <Text style={[s.note, {color: colors.textMuted}]}>
            Only {ownerName} can assign duties. Tick off yours when they're done.
          </Text>
        ) : null}

        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        {renderList()}
      </>
    );
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[s.screen, {backgroundColor: colors.background}]}>
      <View style={s.header}>
        <Text style={[s.title, {color: colors.text}]}>Duties</Text>
        {isOwner ? <AddButton onPress={() => setAdding(true)} /> : null}
      </View>

      <ScrollView
        style={s.screen}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}>
        {renderBody()}
      </ScrollView>

      {flat && isOwner ? (
        <AddDutyModal
          visible={adding}
          onClose={() => setAdding(false)}
          flatId={flat.id}
          ownerId={flat.ownerId}
          members={members}
          me={me}
        />
      ) : null}
    </SafeAreaView>
  );
};

export default Duties;

const s = StyleSheet.create({
  screen: {flex: 1},
  pressed: {opacity: 0.7},
  loader: {marginTop: hp(8)},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(6),
    paddingTop: hp(2),
    paddingBottom: hp(1.6),
  },
  title: {fontSize: 34, lineHeight: 39, fontWeight: '700', letterSpacing: -0.8},
  addButton: {
    width: wp(14),
    height: wp(14),
    borderRadius: wp(4.5),
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flexGrow: 1,
    paddingHorizontal: wp(6),
    paddingBottom: hp(4),
    gap: hp(2),
  },
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  note: {fontSize: 16, lineHeight: 22},

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: wp(5),
    borderWidth: 1,
    paddingVertical: hp(1.8),
  },
  stat: {flex: 1, alignItems: 'center', gap: 2},
  statValue: {fontSize: 32, lineHeight: 38, fontWeight: '700'},
  statLabel: {fontFamily: MONO, fontSize: 12, letterSpacing: 1.2},
  divider: {
    width: StyleSheet.hairlineWidth,
    height: hp(4.5),
   
  },

  card: {
    borderRadius: wp(5),
    borderWidth: 1,
    overflow: 'hidden',
    paddingVertical: wp(4.5),
    paddingLeft: wp(6),
    paddingRight: wp(4.5),
    gap: hp(1.2),
  },
  bar: {position: 'absolute', left: 0, top: 0, bottom: 0, width: wp(1.6)},
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  cardTitle: {
    flex: 1,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: wp(2.6),
    paddingVertical: 3,
    marginTop: 3,
  },
  pillText: {fontFamily: MONO, fontSize: 11, fontWeight: '600', letterSpacing: 1},
  description: {fontSize: 17, lineHeight: 23},
  dueRow: {flexDirection: 'row', alignItems: 'center', gap: wp(2)},
  dueText: {fontSize: 17, fontWeight: '500', flexShrink: 1},

  people: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  avatars: {flexDirection: 'row', flexWrap: 'wrap', gap: wp(2), flex: 1},
  avatarWrap: {position: 'relative'},
  tick: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: wp(4.6),
    height: wp(4.6),
    borderRadius: wp(2.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {fontFamily: MONO, fontSize: 13},

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(3),
    marginTop: hp(0.4),
  },
  doneButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(2),
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
  },
  doneText: {fontSize: 16, fontWeight: '700'},
  notYours: {flex: 1, fontSize: 16},
  deleteButton: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDisabled: {backgroundColor: 'rgba(255,255,255,0.05)', opacity: 0.45},
});