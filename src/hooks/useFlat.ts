import {useEffect, useState} from 'react';
import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';
import type {Flat, Member} from '../services/flat';

const db = getFirestore();

type State = {
  loading: boolean;
  error: boolean;
  profileName: string;
  flat: Flat | null;
  members: Member[];
};

export function useFlat(): State {
  const [state, setState] = useState<State>({
    loading: true,
    error: false,
    profileName: '',
    flat: null,
    members: [],
  });

  useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid) {
      setState(s => ({...s, loading: false}));
      return;
    }

    const patch = (p: Partial<State>) => setState(s => ({...s, ...p}));
    let unsubFlat: (() => void) | undefined;
    let unsubMembers: (() => void) | undefined;
    let activeFlatId: string | null = null;

    const stopFlatListeners = () => {
      unsubFlat?.();
      unsubMembers?.();
      unsubFlat = undefined;
      unsubMembers = undefined;
    };

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      userSnap => {
        const data = userSnap.data();
        const flatId: string | null = data?.flatId ?? null;
        patch({profileName: data?.name ?? ''});

        if (flatId === activeFlatId && flatId !== null) {
          return; // flat unchanged, keep existing listeners
        }
        activeFlatId = flatId;
        stopFlatListeners();

        if (!flatId) {
          patch({flat: null, members: [], loading: false, error: false});
          return;
        }

        unsubFlat = onSnapshot(
          doc(db, 'flats', flatId),
          flatSnap => {
            if (!flatSnap.exists()) {
              patch({flat: null, loading: false});
              return;
            }
            patch({
              flat: {id: flatSnap.id, ...(flatSnap.data() as Omit<Flat, 'id'>)},
              loading: false,
              error: false,
            });
          },
          () => patch({loading: false, error: true}),
        );

        unsubMembers = onSnapshot(
          collection(db, 'flats', flatId, 'members'),
          membersSnap => {
            const list: Member[] = membersSnap.docs.map(d => ({
              id: d.id,
              name: d.data().name,
              role: d.data().role,
            }));
            // Owner first, then alphabetical.
            list.sort((a, b) =>
              a.role === b.role
                ? a.name.localeCompare(b.name)
                : a.role === 'owner'
                  ? -1
                  : 1,
            );
            patch({members: list});
          },
          () => patch({error: true}),
        );
      },
      () => patch({loading: false, error: true}),
    );

    return () => {
      unsubUser();
      stopFlatListeners();
    };
  }, []);

  return state;
}