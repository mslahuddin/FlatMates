import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  serverTimestamp,
  Timestamp,
} from '@react-native-firebase/firestore';
import {splitEqual} from '../libs/money';

const db = getFirestore();

type ExpenseErrorCode = 'invalid-input' | 'not-signed-in';

const expenseError = (code: ExpenseErrorCode) =>
  Object.assign(new Error(code), {code});

export function expenseErrorMessage(e: unknown): string {
  const code = (e as {code?: string})?.code ?? '';
  switch (code) {
    case 'invalid-input':
      return 'Check the amount and description, then try again.';
    case 'firestore/permission-denied':
      return 'You no longer have access to this flat. Please contact the flat administrator.';
    case 'firestore/unavailable':
      return "You're offline. Check your connection and try again.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Adds an expense to the flat, split equally between participantIds.
 * Resolves with queued: true if the server has not confirmed within a few seconds
 * (for example offline). Firestore keeps the write and sends it when back online.
 */
export async function createExpense(input: {
  flatId: string;
  description: string;
  amountPence: number;
  paidBy: string;
  participantIds: string[];
  date: Date;
}): Promise<{queued: boolean}> {
  const user = getAuth().currentUser;
  if (!user) {
    throw expenseError('not-signed-in');
  }
  const description = input.description.trim();
  const {amountPence, paidBy, participantIds, date} = input;
  if (
    !description ||
    !Number.isInteger(amountPence) ||
    amountPence <= 0 ||
    participantIds.length === 0 ||
    !participantIds.includes(paidBy)
  ) {
    throw expenseError('invalid-input');
  }

  const ref = doc(collection(db, 'flats', input.flatId, 'expenses'));
  const shares = splitEqual(amountPence, participantIds, ref.id);

  // The shares must add up to the amount, to the penny.
  const total = Object.values(shares).reduce((sum, s) => sum + s, 0);
  if (total !== amountPence) {
    throw expenseError('invalid-input');
  }

  const write = setDoc(ref, {
    description,
    amountPence,
    currency: 'GBP',
    paidBy,
    participantIds,
    shares,
    splitMethod: 'equal',
    // Noon, so the day never shifts with time zones.
    date: Timestamp.fromDate(
      new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12),
    ),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    deletedAt: null,
  });

  const outcome = await Promise.race([
    write.then(() => 'saved' as const),
    new Promise<'queued'>(resolve => setTimeout(() => resolve('queued'), 6000)),
  ]);
  if (outcome === 'queued') {
    write.catch(() => {});
  }
  return {queued: outcome === 'queued'};
}