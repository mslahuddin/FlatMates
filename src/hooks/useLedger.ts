import {useEffect, useState} from 'react';
import {
  getFirestore,
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';
import type {Expense, Settlement} from '../libs/money';

const db = getFirestore();

type State = {
  loading: boolean;
  error: boolean;
  expenses: Expense[];
  settlements: Settlement[];
};

/** Live expenses and payments for a flat. Soft-deleted rows are left out. */
export function useLedger(flatId: string | undefined): State {
  const [state, setState] = useState<State>({
    loading: !!flatId,
    error: false,
    expenses: [],
    settlements: [],
  });

  useEffect(() => {
    if (!flatId) {
      setState({loading: false, error: false, expenses: [], settlements: []});
      return;
    }
    setState(s => ({...s, loading: true, error: false}));

    let gotExpenses = false;
    let gotSettlements = false;
    const settle = () => {
      if (gotExpenses && gotSettlements) {
        setState(s => ({...s, loading: false}));
      }
    };
    const fail = () => setState(s => ({...s, loading: false, error: true}));

    const unsubExpenses = onSnapshot(
      collection(db, 'flats', flatId, 'expenses'),
      snap => {
        const expenses = snap.docs
          .map(d => ({id: d.id, ...d.data()}) as Expense & {deletedAt?: unknown})
          .filter(e => !e.deletedAt);
        gotExpenses = true;
        setState(s => ({...s, expenses}));
        settle();
      },
      fail,
    );
    const unsubSettlements = onSnapshot(
      collection(db, 'flats', flatId, 'settlements'),
      snap => {
        const settlements = snap.docs
          .map(
            d => ({id: d.id, ...d.data()}) as Settlement & {deletedAt?: unknown},
          )
          .filter(s => !s.deletedAt);
        gotSettlements = true;
        setState(s => ({...s, settlements}));
        settle();
      },
      fail,
    );

    return () => {
      unsubExpenses();
      unsubSettlements();
    };
  }, [flatId]);

  return state;
}


/**
 * useLedger.ts fetches the data that computeBalances needs. It listens live to the flat’s expenses and 
 * settlements collections in Firestore. It hands back {loading, error, expenses, 
 * settlements} and updates by itself when anyone adds or deletes something. It leaves
 *  out soft-deleted rows.
 * */
