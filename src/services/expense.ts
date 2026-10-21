import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  updateDoc,
  writeBatch,
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
      return 'You no longer have access to this flat, or only the person who added this can change it. Please contact the flat administrator.';
    case 'firestore/unavailable':
      return "You're offline. Check your connection and try again.";
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Waits up to 6 seconds for the server. If it has not confirmed (for example
 * offline), resolves queued: true. Firestore keeps the write and sends it later.
 */
export async function confirmOrQueue(write: Promise<unknown>) {
  const outcome = await Promise.race([
    write.then(() => 'saved' as const),
    new Promise<'queued'>(resolve => setTimeout(() => resolve('queued'), 6000)),
  ]);
  if (outcome === 'queued') {
    write.catch(() => {});
  }
  return {queued: outcome === 'queued'};
}

/** A photo of a receipt, compressed by the picker, as base64 text. */
export type ReceiptDraft = {
  base64: string;
  mime: string;
  width?: number;
  height?: number;
};

/**
 * Queues the receipt document in a batch and returns its id.
 * Receipts live at flats/{flatId}/receipts/{id}. Expenses and bills only keep
 * the id, so the lists stay small and the picture loads when it is needed.
 */
export function addReceiptToBatch(
  batch: ReturnType<typeof writeBatch>,
  flatId: string,
  receipt: ReceiptDraft,
  uid: string,
): string {
  const ref = doc(collection(db, 'flats', flatId, 'receipts'));
  batch.set(ref, {
    data: receipt.base64,
    mime: receipt.mime,
    width: receipt.width ?? null,
    height: receipt.height ?? null,
    createdBy: uid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Adds an expense to the flat, split equally between participantIds.
 * The payer can be left out of the split (paying for other people).
 * An optional receipt photo is saved together with the expense, all or nothing.
 */
export async function createExpense(input: {
  flatId: string;
  description: string;
  amountPence: number;
  paidBy: string;
  participantIds: string[];
  date: Date;
  receipt?: ReceiptDraft | null;
}): Promise<{queued: boolean}> {
  const user = getAuth().currentUser;
  if (!user) {
    throw expenseError('not-signed-in');
  }
  const description = input.description.trim();
  const {amountPence, paidBy, date} = input;
  // Each person once. The payer does not have to be one of them.
  const participantIds = Array.from(new Set(input.participantIds));
  if (
    !description ||
    !Number.isInteger(amountPence) ||
    amountPence <= 0 ||
    participantIds.length === 0 ||
    !paidBy
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

  const data = {
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

/**
 * Removes an expense from the flat. It is marked deleted (not erased), so the
 * history is kept and balances recalculate without it. The rules only allow the
 * person who created the expense to do this.
 */
export async function deleteExpense(flatId: string, expenseId: string) {
  if (!getAuth().currentUser) {
    throw expenseError('not-signed-in');
  }
  return confirmOrQueue(
    updateDoc(doc(db, 'flats', flatId, 'expenses', expenseId), {
      // A real timestamp (not a server one), so it also hides the row at once offline.
      deletedAt: Timestamp.now(),
    }),
  );
}