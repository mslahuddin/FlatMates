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
import {
  AddBillModal,
  AddExpenseModal,
  FREQUENCY_LABEL,
  addFrequency,
  billErrorMessage,
  deleteBill,
  markBillPaid,
} from './moneyModals';
import type {Bill, Frequency} from './moneyModals';
import {useFlat} from '../../hooks/useFlat';
import {useLedger} from '../../hooks/useLedger';
import {computeBalances, formatPence} from '../../libs/money';
import type {Expense, Settlement} from '../../libs/money';
import type {Member} from '../../services/flat';
import {useColors} from '../../theme';

type Tab = 'balances' | 'expenses' | 'bills';

const TABS: {value: Tab; label: string}[] = [
  {value: 'balances', label: 'Balances'},
  {value: 'expenses', label: 'Expenses'},
  {value: 'bills', label: 'Bills'},
];

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
const OWE_COLOR = '#EBA24F';
const OWED_COLOR = '#7BC98F';
const CARD_BORDER = 'rgba(255,255,255,0.12)';
const BILL_BG = '#3F2D1A';

/* ---------- Small building blocks ---------- */

const Label = ({text}: {text: string}) => {
  const colors = useColors();
  return <Text style={[styles.label, {color: colors.textMuted}]}>{text}</Text>;
};

const AddButton = ({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({pressed}) => [
        styles.addButton,
        {backgroundColor: colors.lightGreen},
        pressed && styles.pressed,
      ]}>
      <Icon name="add" size={wp(8)} color={colors.black} />
    </Pressable>
  );
};

const NetCard = ({
  net,
  owe,
  owed,
}: {
  net: number;
  owe: number;
  owed: number;
}) => {
  const colors = useColors();
  const netColor = net > 0 ? OWED_COLOR : net < 0 ? OWE_COLOR : colors.white;

  return (
    <View style={styles.card}>
      <Label text="NET BALANCE" />
      <Text
        style={[styles.netAmount, {color: netColor}]}
        accessibilityLabel={`Net balance ${formatPence(net, true)}`}>
        {formatPence(net, true)}
      </Text>
      {net === 0 ? (
        <Text style={[styles.settledText, {color: colors.surfaceAlt}]}>
          You're all settled with everyone.
        </Text>
      ) : (
        <View style={styles.totals}>
          <Text style={[styles.totalText, {color: colors.surfaceAlt}]}>
            You owe{' '}
            <Text style={[styles.totalValue, {color: OWE_COLOR}]}>
              {formatPence(owe)}
            </Text>
          </Text>
          <Text style={[styles.totalText, {color: colors.surfaceAlt}]}>
            You are owed{' '}
            <Text style={[styles.totalValue, {color: OWED_COLOR}]}>
              {formatPence(owed)}
            </Text>
          </Text>
        </View>
      )}
    </View>
  );
};

type PersonRowProps = {
  member: Member | undefined;
  index: number;
  pence: number;
  color: string;
  /** "settle" shows a Settle chip. "open" shows a chevron. */
  action: 'settle' | 'open';
  onPress: () => void;
};

const PersonRow = ({
  member,
  index,
  pence,
  color,
  action,
  onPress,
}: PersonRowProps) => {
  const colors = useColors();
  const name = member?.name ?? 'Former flatmate';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        action === 'settle'
          ? `You owe ${name} ${formatPence(pence)}. Settle up`
          : `${name} owes you ${formatPence(pence)}. Open`
      }
      style={({pressed}) => [styles.personRow, pressed && styles.pressed]}>
      <MemberAvatar name={name} index={index} size={wp(12)} />
      <Text
        style={[styles.personName, {color: colors.white}]}
        numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.personAmount, {color}]}>{formatPence(pence)}</Text>
      {action === 'settle' ? (
        <View style={styles.settleChip}>
          <View
            style={[
              StyleSheet.absoluteFill,
              {backgroundColor: colors.lightGreen, opacity: 0.16},
            ]}
          />
          <Text style={[styles.settleText, {color: colors.lightGreen}]}>
            Settle
          </Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={wp(6)} color={colors.textMuted} />
      )}
    </Pressable>
  );
};

/* ---------- Expenses tab ---------- */

type Filter = 'all' | 'involved' | 'paid';

const FILTERS: {value: Filter; label: string}[] = [
  {value: 'all', label: 'All'},
  {value: 'involved', label: "I'm involved"},
  {value: 'paid', label: 'I paid'},
];

type FeedItem =
  | {
      kind: 'expense';
      id: string;
      date: Date;
      title: string;
      paidBy: string;
      amountPence: number;
      myShare: number;
      involved: boolean;
    }
  | {
      kind: 'payment';
      id: string;
      date: Date;
      fromUid: string;
      toUid: string;
      amountPence: number;
    };

/** Firestore Timestamp -> Date. Falls back to now (a write still waiting for the server). */
const toJsDate = (value: unknown): Date => {
  const v = value as {toDate?: () => Date} | null | undefined;
  return v && typeof v.toDate === 'function' ? v.toDate() : new Date();
};

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});

const monthLabel = (d: Date) => {
  const name = d
    .toLocaleDateString('en-GB', {month: 'long'})
    .toUpperCase();
  return d.getFullYear() === new Date().getFullYear()
    ? name
    : `${name} ${d.getFullYear()}`;
};

const FilterChip = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{selected}}
      style={({pressed}) => [
        x.chip,
        selected
          ? {backgroundColor: colors.lightGreen}
          : {backgroundColor: 'rgba(255,255,255,0.06)'},
        pressed && styles.pressed,
      ]}>
      <Text
        style={[
          x.chipText,
          {color: selected ? colors.black : colors.textMuted},
          selected && x.chipTextSelected,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
};

const FeedRow = ({
  title,
  sub,
  amount,
  amountColor,
  note,
  divider,
}: {
  title: string;
  sub: string;
  amount: string;
  amountColor?: string;
  note: string;
  divider: boolean;
}) => {
  const colors = useColors();
  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${sub}. ${amount}, ${note}`}
      style={[x.row, divider && x.rowDivider]}>
      <View style={x.rowLeft}>
        <Text
          style={[x.rowTitle, {color: colors.white}]}
          numberOfLines={1}>
          {title}
        </Text>
        <Text style={[x.rowSub, {color: colors.textMuted}]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={x.rowRight}>
        <Text style={[x.rowAmount, {color: amountColor ?? colors.white}]}>
          {amount}
        </Text>
        <Text style={[x.rowSub, {color: colors.textMuted}]}>{note}</Text>
      </View>
    </View>
  );
};

type ExpensesTabProps = {
  me: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
};

const ExpensesTab = ({me, members, expenses, settlements}: ExpensesTabProps) => {
  const [filter, setFilter] = useState<Filter>('all');

  const nameOf = (uid: string) =>
    uid === me
      ? 'You'
      : members.find(member => member.id === uid)?.name ?? 'Former flatmate';

  // One list of expenses and payments, newest first, filtered, grouped by month.
  const sections = useMemo(() => {
    const items: FeedItem[] = [];

    for (const e of expenses) {
      const myShare = e.shares?.[me] ?? 0;
      items.push({
        kind: 'expense',
        id: `e-${e.id}`,
        date: toJsDate((e as {date?: unknown}).date),
        title: e.description?.trim() || 'Expense',
        paidBy: e.paidBy,
        amountPence: e.amountPence,
        myShare,
        involved: e.paidBy === me || e.shares?.[me] !== undefined,
      });
    }
    for (const s of settlements) {
      const raw = s as {date?: unknown; createdAt?: unknown};
      items.push({
        kind: 'payment',
        id: `s-${s.id}`,
        date: toJsDate(raw.date ?? raw.createdAt),
        fromUid: s.fromUid,
        toUid: s.toUid,
        amountPence: s.amountPence,
      });
    }

    const visible = items.filter(item => {
      if (filter === 'all') {
        return true;
      }
      if (item.kind === 'expense') {
        return filter === 'paid' ? item.paidBy === me : item.involved;
      }
      return filter === 'paid'
        ? item.fromUid === me
        : item.fromUid === me || item.toUid === me;
    });

    visible.sort((a, b) => b.date.getTime() - a.date.getTime());

    const groups: {key: string; label: string; items: FeedItem[]}[] = [];
    for (const item of visible) {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(item);
      } else {
        groups.push({key, label: monthLabel(item.date), items: [item]});
      }
    }
    return groups;
  }, [expenses, settlements, filter, me]);

  const renderItem = (item: FeedItem, divider: boolean) => {
    if (item.kind === 'payment') {
      const title =
        item.fromUid === me
          ? `Payment to ${nameOf(item.toUid)}`
          : item.toUid === me
          ? `Payment from ${nameOf(item.fromUid)}`
          : `${nameOf(item.fromUid)} paid ${nameOf(item.toUid)}`;
      return (
        <FeedRow
          key={item.id}
          title={title}
          sub={`${nameOf(item.fromUid)} · ${shortDate(item.date)}`}
          amount={formatPence(item.amountPence)}
          amountColor={OWED_COLOR}
          note="settled"
          divider={divider}
        />
      );
    }

    let note = 'not involved';
    if (item.paidBy === me) {
      const lent = item.amountPence - item.myShare;
      note = lent > 0 ? `you lent ${formatPence(lent)}` : 'you paid';
    } else if (item.involved) {
      note = `you owe ${formatPence(item.myShare)}`;
    }
    return (
      <FeedRow
        key={item.id}
        title={item.title}
        sub={`${nameOf(item.paidBy)} paid · ${shortDate(item.date)}`}
        amount={formatPence(item.amountPence)}
        note={note}
        divider={divider}
      />
    );
  };

  return (
    <>
      <View style={x.chips}>
        {FILTERS.map(f => (
          <FilterChip
            key={f.value}
            label={f.label}
            selected={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      {sections.length === 0 ? (
        <EmptyState
          icon="filter-list"
          title="Nothing here"
          description="No expenses match this filter."
        />
      ) : (
        sections.map(section => (
          <View key={section.key}>
            <Label text={section.label} />
            {section.items.map((item, i) =>
              renderItem(item, i < section.items.length - 1),
            )}
          </View>
        ))
      )}
    </>
  );
};

const x = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: wp(2.5)},
  chip: {
    borderRadius: 999,
    paddingHorizontal: wp(4),
    paddingVertical: hp(0.9),
  },
  chipText: {fontSize: 17, fontWeight: '500'},
  chipTextSelected: {fontWeight: '700'},

  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
    paddingVertical: hp(1.8),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  rowLeft: {flex: 1, gap: 2},
  rowRight: {alignItems: 'flex-end', gap: 2},
  rowTitle: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  rowAmount: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  rowSub: {fontSize: 17, lineHeight: 22},

  banner: {
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: OWE_COLOR,
    backgroundColor: BILL_BG,
    padding: wp(5),
    gap: hp(0.8),
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  bannerTitle: {
    flex: 1,
    color: OWE_COLOR,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
  },
  bannerDate: {
    color: OWE_COLOR,
    fontFamily: MONO,
    fontSize: 16,
    marginTop: 4,
  },
  bannerSub: {fontSize: 17},

  billRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
    paddingVertical: hp(1.8),
  },
  billDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.18)',
  },
  billLeft: {flex: 1, gap: 2},
  billRight: {alignItems: 'flex-end', gap: 2},
  billTitle: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  billSub: {fontSize: 17, lineHeight: 22},
});

/* ---------- Bills tab ---------- */

/** Live list of the flat's bills, soonest due first. Deleted bills are left out. */
function useBills(flatId: string | undefined) {
  const [state, setState] = useState<{
    loading: boolean;
    error: boolean;
    bills: Bill[];
  }>({loading: !!flatId, error: false, bills: []});

  useEffect(() => {
    if (!flatId) {
      setState({loading: false, error: false, bills: []});
      return;
    }
    setState(prev => ({...prev, loading: true, error: false}));
    const unsubscribe = onSnapshot(
      collection(getFirestore(), 'flats', flatId, 'bills'),
      snap => {
        const bills = snap.docs
          .map(d => {
            const data = d.data() as Record<string, any>;
            if (data.deletedAt) {
              return null;
            }
            return {
              id: d.id,
              name: data.name ?? 'Bill',
              amountPence: data.amountPence ?? 0,
              frequency: (data.frequency ?? 'monthly') as Frequency,
              nextDue: toJsDate(data.nextDue),
              paidBy: data.paidBy,
              participantIds: data.participantIds ?? [],
              shares: data.shares ?? {},
            } as Bill;
          })
          .filter((b): b is Bill => b !== null)
          .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
        setState({loading: false, error: false, bills});
      },
      () => setState({loading: false, error: true, bills: []}),
    );
    return unsubscribe;
  }, [flatId]);

  return state;
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from today to `d`. 0 = today, 1 = tomorrow, negative = overdue. */
const daysUntil = (d: Date) =>
  Math.round(
    (startOfDay(d).getTime() - startOfDay(new Date()).getTime()) / 86400000,
  );

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** "Internet is due in 3 days", "Rent is due tomorrow", "Gas is overdue by 2 days". */
const dueSentence = (name: string, days: number) => {
  if (days < 0) {
    return `${name} is overdue by ${plural(-days)}`;
  }
  if (days === 0) {
    return `${name} is due today`;
  }
  if (days === 1) {
    return `${name} is due tomorrow`;
  }
  return `${name} is due in ${plural(days)}`;
};

const dueDate = (d: Date) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : {year: 'numeric'}),
  });

type BillsTabProps = {
  me: string;
  members: Member[];
  bills: Bill[];
  loading: boolean;
  error: boolean;
  onAdd: () => void;
  onOpen: (bill: Bill) => void;
};

const BillsTab = ({
  me,
  members,
  bills,
  loading,
  error,
  onAdd,
  onOpen,
}: BillsTabProps) => {
  const colors = useColors();

  const nameOf = (uid: string) =>
    uid === me
      ? 'You'
      : members.find(member => member.id === uid)?.name ?? 'Former flatmate';

  if (loading) {
    return (
      <ActivityIndicator color={colors.lightGreen} style={styles.loader} />
    );
  }
  if (error) {
    return (
      <EmptyState
        icon="cloud-off"
        title="Couldn't load bills"
        description="Check your connection and try again."
      />
    );
  }
  if (bills.length === 0) {
    return (
      <EmptyState
        icon="receipt-long"
        title="No bills yet"
        description="Add recurring bills like rent and internet. Flatmate reminds everyone before they are due."
        actionLabel="Add bill"
        onAction={onAdd}
      />
    );
  }

  const overdue = bills.filter(b => daysUntil(b.nextDue) < 0);
  const upcoming = bills.filter(b => daysUntil(b.nextDue) >= 0);

  // The banner is for the bill that needs attention first, if it is within a week.
  const next = bills[0];
  const nextDays = daysUntil(next.nextDue);
  const nextShare = next.shares[me];

  const renderRow = (bill: Bill, i: number, list: Bill[]) => {
    const late = daysUntil(bill.nextDue) < 0;
    const payer =
      bill.paidBy === me ? 'You pay' : `${nameOf(bill.paidBy)} pays`;
    return (
      <Pressable
        key={bill.id}
        onPress={() => onOpen(bill)}
        accessibilityRole="button"
        accessibilityLabel={`${bill.name}, ${formatPence(
          bill.amountPence,
        )}, ${FREQUENCY_LABEL[bill.frequency]}, ${payer}, due ${dueDate(
          bill.nextDue,
        )}${late ? ', overdue' : ''}. Options`}
        style={({pressed}) => [
          x.billRow,
          i < list.length - 1 && x.billDivider,
          pressed && styles.pressed,
        ]}>
        <View style={x.billLeft}>
          <Text style={[x.billTitle, {color: colors.white}]} numberOfLines={1}>
            {bill.name}
          </Text>
          <Text
            style={[x.billSub, {color: colors.textMuted}]}
            numberOfLines={1}>
            {FREQUENCY_LABEL[bill.frequency]} · {payer}
          </Text>
        </View>
        <View style={x.billRight}>
          <Text style={[x.billTitle, {color: colors.white}]}>
            {formatPence(bill.amountPence)}
          </Text>
          <Text
            style={[x.billSub, {color: late ? OWE_COLOR : colors.textMuted}]}>
            {dueDate(bill.nextDue)}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {nextDays <= 7 ? (
        <Pressable
          onPress={() => onOpen(next)}
          accessibilityRole="button"
          accessibilityLabel={`${dueSentence(next.name, nextDays)}. Options`}
          style={({pressed}) => [x.banner, pressed && styles.pressed]}>
          <View style={x.bannerTop}>
            <Text style={x.bannerTitle} numberOfLines={2}>
              {dueSentence(next.name, nextDays)}
            </Text>
            <Text style={x.bannerDate}>{dueDate(next.nextDue)}</Text>
          </View>
          <Text style={[x.bannerSub, {color: colors.textMuted}]}>
            {formatPence(next.amountPence)}
            {nextShare !== undefined
              ? ` · your share ${formatPence(nextShare)}`
              : ''}
          </Text>
        </Pressable>
      ) : null}

      {overdue.length > 0 ? (
        <View>
          <Label text="OVERDUE" />
          {overdue.map(renderRow)}
        </View>
      ) : null}

      {upcoming.length > 0 ? (
        <View>
          <Label text="UPCOMING" />
          {upcoming.map(renderRow)}
        </View>
      ) : null}
    </>
  );
};

/* ---------- Screen ---------- */

const Money = () => {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('balances');

  const {loading: flatLoading, error: flatError, flat, members} = useFlat();
  const {
    loading: ledgerLoading,
    error: ledgerError,
    expenses,
    settlements,
  } = useLedger(flat?.id);

  const me = getAuth().currentUser?.uid ?? '';
  const balances = useMemo(
    () => computeBalances(me, expenses, settlements),
    [me, expenses, settlements],
  );

  const memberOf = (uid: string) => members.find(m => m.id === uid);
  const indexOf = (uid: string) =>
    Math.max(
      0,
      members.findIndex(m => m.id === uid),
    );

  const {
    loading: billsLoading,
    error: billsError,
    bills,
  } = useBills(flat?.id);

  const [adding, setAdding] = useState(false);
  const [addingBill, setAddingBill] = useState(false);
  const addExpense = () => setAdding(true);
  const addBill = () => setAddingBill(true);

  /** Tap a bill: mark it paid (adds an expense, moves the due date) or delete it. */
  const openBill = (bill: Bill) => {
    if (!flat) {
      return;
    }
    const following = addFrequency(bill.nextDue, bill.frequency);
    const payer =
      bill.paidBy === me
        ? 'you'
        : members.find(member => member.id === bill.paidBy)?.name ?? 'them';
    Alert.alert(
      bill.name,
      `${formatPence(bill.amountPence)} · due ${dueDate(
        bill.nextDue,
      )}\n\nMark as paid adds a ${formatPence(
        bill.amountPence,
      )} expense paid by ${payer}, then moves the next due date to ${dueDate(
        following,
      )}.`,
      [
        {
          text: 'Mark as paid',
          onPress: async () => {
            try {
              await markBillPaid(flat.id, bill);
            } catch (e) {
              Alert.alert("Couldn't mark as paid", billErrorMessage(e));
            }
          },
        },
        {
          text: 'Delete bill',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBill(flat.id, bill.id);
            } catch (e) {
              Alert.alert("Couldn't delete the bill", billErrorMessage(e));
            }
          },
        },
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  };
  const hasHistory = expenses.length > 0 || settlements.length > 0;

  const renderBalances = () => {
    if (!hasHistory) {
      return (
        <EmptyState
          icon="paid"
          title="No expenses yet"
          description="Add your first shared expense and Flatmate works out who owes what."
          actionLabel="Add expense"
          onAction={addExpense}
        />
      );
    }
    return (
      <>
        <NetCard
          net={balances.net}
          owe={balances.oweTotal}
          owed={balances.owedTotal}
        />

        {balances.owe.length > 0 ? (
          <View style={styles.section}>
            <Label text="YOU OWE" />
            {balances.owe.map(p => (
              <PersonRow
                key={p.uid}
                member={memberOf(p.uid)}
                index={indexOf(p.uid)}
                pence={p.pence}
                color={OWE_COLOR}
                action="settle"
                onPress={() =>
                  navigation.navigate('SettleUp', {
                    withUid: p.uid,
                    amountPence: p.pence,
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {balances.owed.length > 0 ? (
          <View style={styles.section}>
            <Label text="YOU ARE OWED" />
            {balances.owed.map(p => (
              <PersonRow
                key={p.uid}
                member={memberOf(p.uid)}
                index={indexOf(p.uid)}
                pence={p.pence}
                color={OWED_COLOR}
                action="open"
                onPress={() =>
                  navigation.navigate('PersonBalance', {uid: p.uid})
                }
              />
            ))}
          </View>
        ) : null}
      </>
    );
  };

  const renderTab = () => {
    if (tab === 'balances') {
      return renderBalances();
    }
    if (tab === 'expenses') {
      return hasHistory ? (
        <ExpensesTab
          me={me}
          members={members}
          expenses={expenses}
          settlements={settlements}
        />
      ) : (
        <EmptyState
          icon="paid"
          title="No expenses yet"
          description="Add your first shared expense and Flatmate works out who owes what."
          actionLabel="Add expense"
          onAction={addExpense}
        />
      );
    }
    return (
      <BillsTab
        me={me}
        members={members}
        bills={bills}
        loading={billsLoading}
        error={billsError}
        onAdd={addBill}
        onOpen={openBill}
      />
    );
  };

  const renderBody = () => {
    if (flatLoading || (flat && ledgerLoading)) {
      return (
        <ActivityIndicator color={colors.lightGreen} style={styles.loader} />
      );
    }
    if (flatError || ledgerError) {
      return (
        <EmptyState
          icon="cloud-off"
          title="Couldn't load money"
          description="Check your connection and try again."
        />
      );
    }
    if (!flat) {
      return (
        <EmptyState
          icon="home"
          title="No flat yet"
          description="Create or join a flat to share expenses with your flatmates."
          actionLabel="Go to dashboard"
          onAction={() => navigation.navigate('Home')}
        />
      );
    }
    return (
      <>
        <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        {renderTab()}
      </>
    );
  };

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text style={[styles.title, {color: colors.white}]}>Money</Text>
        {flat ? (
          <AddButton
            onPress={tab === 'bills' ? addBill : addExpense}
            label={tab === 'bills' ? 'Add bill' : 'Add expense'}
          />
        ) : null}
      </View>

      {/* Tab content scrolls. Empty states fill the space and stay centred. */}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {renderBody()}
      </ScrollView>

      {flat ? (
        <>
          <AddExpenseModal
            visible={adding}
            onClose={() => setAdding(false)}
            flatId={flat.id}
            members={members}
            me={me}
          />
          <AddBillModal
            visible={addingBill}
            onClose={() => setAddingBill(false)}
            flatId={flat.id}
            members={members}
            me={me}
          />
        </>
      ) : null}
    </SafeAreaView>
  );
};

export default Money;

const styles = StyleSheet.create({
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

  card: {
    borderRadius: wp(5),
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(0,0,0,0.28)',
    padding: wp(5),
    gap: hp(1),
  },
  label: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 1.6,
  },
  netAmount: {
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: hp(0.6),
  },
  totalText: {fontSize: 17},
  totalValue: {fontWeight: '700'},
  settledText: {fontSize: 17, marginTop: hp(0.4)},

  section: {gap: hp(1.2)},
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(3),
    paddingVertical: hp(0.6),
  },
  personName: {flex: 1, fontSize: 22, fontWeight: '500'},
  personAmount: {fontSize: 22, fontWeight: '700'},
  settleChip: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: wp(3),
    paddingVertical: hp(0.6),
  },
  settleText: {fontFamily: MONO, fontSize: 14, fontWeight: '600'},

});