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
  materialiseDueBills,
} from './moneyModals';
import type {Bill, Frequency} from './moneyModals';
import {ReceiptThumb, ReceiptViewer} from './Receipts';
import {useFlat} from '../../hooks/useFlat';
import {useLedger} from '../../hooks/useLedger';
import {computeBalances, formatPence} from '../../libs/money';
import type {Expense, Settlement} from '../../libs/money';
import {
  createSettlement,
  deleteExpense,
  expenseErrorMessage,
} from '../../services/expense';
import type {Member} from '../../services/flat';
import {MONO ,useColors} from '../../theme';

type Tab = 'balances' | 'expenses' | 'bills';

const TABS: {value: Tab; label: string}[] = [
  {value: 'balances', label: 'Balances'},
  {value: 'expenses', label: 'Expenses'},
  {value: 'bills', label: 'Bills'},
];



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
        {backgroundColor: colors.accent},
        pressed && styles.pressed,
      ]}>
      <Icon name="add" size={wp(8)} color={colors.black} />
    </Pressable>
  );
};

/** Red when you can delete the item, grey and disabled when you can't. */
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
        styles.deleteButton,
        enabled
          ? {backgroundColor: colors.dangerBg}
          : styles.deleteDisabled,
        pressed && styles.pressed,
      ]}>
      <Icon
        name="delete-outline"
        size={wp(5.5)}
        color={enabled ? colors.danger : colors.textMuted}
      />
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
  const netColor = net > 0 ? colors.success : net < 0 ? colors.warning : colors.text;

  return (
    <View
    style={[
      styles.card,
      {
        borderColor: colors.cardBorder,
        backgroundColor: colors.card,
      },
    ]}>
      <Label text="NET BALANCE" />
      <Text
        style={[styles.netAmount, {color: netColor}]}
        accessibilityLabel={`Net balance ${formatPence(net, true)}`}>
        {formatPence(net, true)}
      </Text>
      {net === 0 ? (
        <Text style={[styles.settledText, {color: colors.textSecondary}]}>
          You're all settled with everyone.
        </Text>
      ) : (
        <View style={styles.totals}>
          <Text style={[styles.totalText, {color: colors.textSecondary}]}>
            You owe{' '}
            <Text style={[styles.totalValue, {color: colors.warning}]}>
              {formatPence(owe)}
            </Text>
          </Text>
          <Text style={[styles.totalText, {color: colors.textSecondary}]}>
            You are owed{' '}
            <Text style={[styles.totalValue, {color: colors.success}]}>
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
  /** "settle": you owe them (Settle chip). "received": they owe you (Received chip). */
  action: 'settle' | 'received';
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
          : `${name} owes you ${formatPence(pence)}. Mark as received`
      }
      style={({pressed}) => [styles.personRow, pressed && styles.pressed]}>
      <MemberAvatar name={name} index={index} size={wp(12)} />
      <Text
        style={[styles.personName, {color: colors.text}]}
        numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.personAmount, {color}]}>{formatPence(pence)}</Text>
      <View style={styles.settleChip}>
        <View
          style={[
            StyleSheet.absoluteFill,
            {backgroundColor: colors.accent, opacity: 0.16},
          ]}
        />
        <Text style={[styles.settleText, {color: colors.accent}]}>
          {action === 'settle' ? 'Settle' : 'Received'}
        </Text>
      </View>
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
      fromBill: boolean;
      expenseId: string;
      createdBy?: string;
      receiptId?: string | null;
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
          ? {backgroundColor: colors.accent}
          : {backgroundColor: 'colors.chip)'},
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
  thumb,
  canDelete,
  onDelete,
}: {
  title: string;
  sub: string;
  amount: string;
  amountColor?: string;
  note: string;
  divider: boolean;
  /** Picture shown on the left (receipt or default icon). */
  thumb?: React.ReactNode;
  /** True when you can delete it (you created it). Otherwise the button is grey. */
  canDelete: boolean;
  onDelete: () => void;
}) => {
  const colors = useColors();
  return (
<View
  style={[
    x.row,
    divider && [
      x.rowDivider,
      {borderBottomColor: colors.divider},
    ],
  ]}
>
      {thumb}
      <View
        accessible
        accessibilityLabel={`${title}. ${sub}. ${amount}, ${note}`}
        style={x.rowBody}>
        <View style={x.rowLeft}>
          <Text
            style={[x.rowTitle, {color: colors.text}]}
            numberOfLines={1}>
            {title}
          </Text>
          <Text style={[x.rowSub, {color: colors.textMuted}]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={x.rowRight}>
          <Text style={[x.rowAmount, {color: amountColor ?? colors.text}]}>
            {amount}
          </Text>
          <Text style={[x.rowSub, {color: colors.textMuted}]}>{note}</Text>
        </View>
      </View>
      <DeleteButton
        enabled={canDelete}
        onPress={onDelete}
        label={`Delete ${title}`}
      />
    </View>
  );
};

type ExpensesTabProps = {
  flatId: string;
  me: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
};

const ExpensesTab = ({
  flatId,
  me,
  members,
  expenses,
  settlements,
}: ExpensesTabProps) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [viewing, setViewing] = useState<string | null>(null);
  const colors = useColors();

  /** Asks first, then marks the expense deleted. Balances recalculate. */
  const confirmDelete = (item: Extract<FeedItem, {kind: 'expense'}>) => {
    Alert.alert(
      'Delete this expense?',
      `${item.title} · ${formatPence(
        item.amountPence,
      )}\n\nIt is removed for everyone and balances update.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(flatId, item.expenseId);
            } catch (e) {
              Alert.alert("Couldn't delete the expense", expenseErrorMessage(e));
            }
          },
        },
      ],
    );
  };

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
        fromBill: !!(e as {billId?: string}).billId,
        expenseId: e.id,
        createdBy: (e as {createdBy?: string}).createdBy,
        receiptId: (e as {receiptId?: string | null}).receiptId ?? null,
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
          amountColor={colors.success}
          note="settled"
          divider={divider}
          thumb={
            <ReceiptThumb
              flatId={flatId}
              receiptId={null}
              size={wp(13)}
              fallbackIcon="swap-horiz"
            />
          }
          canDelete={false}
          onDelete={() => {}}
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
        sub={`${nameOf(item.paidBy)} paid · ${shortDate(item.date)}${
          item.fromBill ? ' · bill' : ''
        }`}
        amount={formatPence(item.amountPence)}
        note={note}
        divider={divider}
        thumb={
          <ReceiptThumb
            flatId={flatId}
            receiptId={item.receiptId}
            size={wp(13)}
            onPress={
              item.receiptId
                ? () => setViewing(item.receiptId ?? null)
                : undefined
            }
          />
        }
        canDelete={item.createdBy === me}
        onDelete={() => confirmDelete(item)}
      />
    );
  };

  return (
    <>
      <ReceiptViewer
        flatId={flatId}
        receiptId={viewing}
        onClose={() => setViewing(null)}
      />
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
    alignItems: 'center',
    gap: wp(3),
    paddingVertical: hp(1.8),
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {flex: 1, gap: 2},
  rowRight: {alignItems: 'flex-end', gap: 2},
  rowTitle: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  rowAmount: {fontSize: 22, lineHeight: 28, fontWeight: '700'},
  rowSub: {fontSize: 17, lineHeight: 22},

  banner: {
    borderRadius: wp(5),
    borderWidth: 1,

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
   
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700',
  },
  bannerDate: {
   
    fontFamily: MONO,
    fontSize: 16,
    marginTop: 4,
  },
  bannerSub: {fontSize: 17},

  billWrap: {flexDirection: 'row', alignItems: 'center', gap: wp(3)},
  billRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
    paddingVertical: hp(1.8),
  },
  billDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    
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
              createdBy: data.createdBy ?? '',
              receiptId: data.receiptId ?? null,
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
  flatId: string;
  me: string;
  members: Member[];
  bills: Bill[];
  loading: boolean;
  error: boolean;
  onAdd: () => void;
  onOpen: (bill: Bill) => void;
  /** Called when the person who added a bill taps its delete button. */
  onDelete: (bill: Bill) => void;
};

const BillsTab = ({
  flatId,
  me,
  members,
  bills,
  loading,
  error,
  onAdd,
  onOpen,
  onDelete,
}: BillsTabProps) => {
  const colors = useColors();
  const [viewing, setViewing] = useState<string | null>(null);

  const nameOf = (uid: string) =>
    uid === me
      ? 'You'
      : members.find(member => member.id === uid)?.name ?? 'Former flatmate';

  if (loading) {
    return (
      <ActivityIndicator color={colors.accent} style={styles.loader} />
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
      <View
        key={bill.id}
         style={[
    x.billWrap,
    i < list.length - 1 && [
      x.billDivider,
      {borderBottomColor: colors.divider},
    ],
  ]}>
        <ReceiptThumb
          flatId={flatId}
          receiptId={bill.receiptId}
          size={wp(13)}
          fallbackIcon="autorenew"
          onPress={
            bill.receiptId ? () => setViewing(bill.receiptId) : undefined
          }
        />
        <Pressable
          onPress={() => onOpen(bill)}
          accessibilityRole="button"
          accessibilityLabel={`${bill.name}, ${formatPence(
            bill.amountPence,
          )}, ${FREQUENCY_LABEL[bill.frequency]}, ${payer}, due ${dueDate(
            bill.nextDue,
          )}${late ? ', overdue' : ''}. Options`}
          style={({pressed}) => [x.billRow, pressed && styles.pressed]}>
          <View style={x.billLeft}>
            <Text
              style={[x.billTitle, {color: colors.text}]}
              numberOfLines={1}>
              {bill.name}
            </Text>
            <Text
              style={[x.billSub, {color: colors.textMuted}]}
              numberOfLines={1}>
              {FREQUENCY_LABEL[bill.frequency]} · {payer}
            </Text>
          </View>
          <View style={x.billRight}>
            <Text style={[x.billTitle, {color: colors.text}]}>
              {formatPence(bill.amountPence)}
            </Text>
            <Text
              style={[x.billSub, {color: late ? colors.warning : colors.textMuted}]}>
              {dueDate(bill.nextDue)}
            </Text>
          </View>
        </Pressable>
        <DeleteButton
          enabled={bill.createdBy === me}
          onPress={() => onDelete(bill)}
          label={`Delete ${bill.name}`}
        />
      </View>
    );
  };

  return (
    <>
      <ReceiptViewer
        flatId={flatId}
        receiptId={viewing}
        onClose={() => setViewing(null)}
      />
      {nextDays <= 7 ? (
        <Pressable
          onPress={() => onOpen(next)}
          accessibilityRole="button"
          accessibilityLabel={`${dueSentence(next.name, nextDays)}. Options`}
         style={({pressed}) => [
  x.banner,
  {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  pressed && styles.pressed,
]}>
          <View style={x.bannerTop}>
            <Text style={[x.bannerTitle ,{color: colors.warning}]} numberOfLines={2}>
              {dueSentence(next.name, nextDays)}
            </Text>
            <Text style={[x.bannerDate,{color: colors.warning}]}>{dueDate(next.nextDue)}</Text>
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

  // Bills that have reached their due date become expenses, so balances include them.
  useEffect(() => {
    if (flat && bills.length > 0) {
      materialiseDueBills(flat.id, bills);
    }
  }, [flat, bills]);

  const [adding, setAdding] = useState(false);
  const [addingBill, setAddingBill] = useState(false);
  const addExpense = () => setAdding(true);
  const addBill = () => setAddingBill(true);

  /** Asks first, then marks the bill deleted. Expenses it already made stay. */
  const confirmDeleteBill = (bill: Bill) => {
    if (!flat) {
      return;
    }
    Alert.alert(
      'Delete this bill?',
      `${bill.name} · ${formatPence(
        bill.amountPence,
      )}\n\nIt stops repeating. Expenses it already added stay in the list.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBill(flat.id, bill.id);
            } catch (e) {
              Alert.alert("Couldn't delete the bill", billErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  /** Tap a bill: add it to expenses now, or (if you added it) delete it. */
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
      )}\n\nOn the due date this is added to Expenses and split in Balances automatically (paid by ${payer}).\n\nPay now and moves the next due date to ${dueDate(
        following,
      )}.`,
      [
        {
          text: 'Pay bill',
          onPress: async () => {
            try {
              await markBillPaid(flat.id, bill);
            } catch (e) {
              Alert.alert("Couldn't add the bill", billErrorMessage(e));
            }
          },
        },
        ...(bill.createdBy === me
          ? [
              {
                text: 'Delete bill',
                style: 'destructive' as const,
                onPress: () => confirmDeleteBill(bill),
              },
            ]
          : []),
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  };
  const hasHistory = expenses.length > 0 || settlements.length > 0;

  /** Records the payment, then balances update for everyone. */
  const [settling, setSettling] = useState(false);
  const recordPayment = async (
    fromUid: string,
    toUid: string,
    amountPence: number,
  ) => {
    if (!flat || settling) {
      return;
    }
    try {
      setSettling(true);
      await createSettlement({flatId: flat.id, fromUid, toUid, amountPence});
    } catch (e) {
      Alert.alert("Couldn't record the payment", expenseErrorMessage(e));
    } finally {
      setSettling(false);
    }
  };

  /** You owe them. Asks first, then records a payment from you to them. */
  const settleUp = (uid: string, pence: number) => {
    const name = memberOf(uid)?.name ?? 'them';
    Alert.alert(
      `Settle up with ${name}?`,
      `This records that you paid ${name} ${formatPence(
        pence,
      )}. Only confirm once you've paid them. Balances update for everyone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: `Settle ${formatPence(pence)}`,
          onPress: () => recordPayment(me, uid, pence),
        },
      ],
    );
  };

  /** They owe you. Asks first, then records a payment from them to you. */
  const markReceived = (uid: string, pence: number) => {
    const name = memberOf(uid)?.name ?? 'them';
    Alert.alert(
      `Received from ${name}?`,
      `This records that ${name} paid you ${formatPence(
        pence,
      )}. Only confirm if you've received it. Balances update for everyone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: `Received ${formatPence(pence)}`,
          onPress: () => recordPayment(uid, me, pence),
        },
      ],
    );
  };

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
                color={colors.warning}
                action="settle"
                onPress={() => settleUp(p.uid, p.pence)}
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
                color={colors.success}
                action="received"
                onPress={() => markReceived(p.uid, p.pence)}
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
          flatId={flat?.id ?? ''}
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
        flatId={flat?.id ?? ''}
        me={me}
        members={members}
        bills={bills}
        loading={billsLoading}
        error={billsError}
        onAdd={addBill}
        onOpen={openBill}
        onDelete={confirmDeleteBill}
      />
    );
  };

  const renderBody = () => {
    if (flatLoading || (flat && ledgerLoading)) {
      return (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
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
        <Text style={[styles.title, {color: colors.text}]}>Money</Text>
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
  deleteButton: {
    width: wp(10),
    height: wp(10),
    borderRadius: wp(3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDisabled: {backgroundColor: 'rgba(255,255,255,0.05)', opacity: 0.45},

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