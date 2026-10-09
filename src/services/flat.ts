import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
} from '@react-native-firebase/firestore';

const db = getFirestore();

export type Role = 'owner' | 'member';
export type Flat = {
  id: string;
  name: string;
  address: string;
  maxMembers: number;
  ownerId: string;
  inviteCode: string;
};
export type Member = {id: string; name: string; role: Role};

type FlatErrorCode =
  | 'already-in-flat'
  | 'invalid-code'
  | 'flat-full'
  | 'code-taken'
  | 'invalid-input'
  | 'not-signed-in';

const flatError = (code: FlatErrorCode) =>
  Object.assign(new Error(code), {code});

export function flatErrorMessage(e: unknown): string {
  const code = (e as {code?: string})?.code ?? '';
  switch (code) {
    case 'already-in-flat':
      return 'You are already in a flat. Leave it before joining another.';
    case 'invalid-code':
      return "That code doesn't match any flat. Check it and try again.";
    case 'flat-full':
      return 'This flat is full.';
    case 'invalid-input':
      return 'Check the details and try again.';
    case 'firestore/permission-denied':
      return 'You no longer have access. Please contact the flat owner.';
    case 'firestore/unavailable':
    case 'firestore/deadline-exceeded':
      return 'No connection. Check your internet and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const cityPrefix = (source: string) =>
  source
    .replace(/[^a-zA-Z ]/g, '')
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase()
    .slice(0, 10) || 'FLAT';

const makeCode = (prefix: string) =>
  `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

const currentUser = () => {
  const user = getAuth().currentUser;
  if (!user) {
    throw flatError('not-signed-in');
  }
  return user;
};

const displayNameOf = (
  profileName: string | undefined,
  user: ReturnType<typeof currentUser>,
) => profileName || user.displayName || user.email?.split('@')[0] || 'Flatmate';

/** Creates a flat, makes the caller its owner, and generates the invite code. */
export async function createFlat(input: {
  name: string;
  address?: string;
  city?: string;
  maxMembers: number;
}) {
  const user = currentUser();
  const name = input.name.trim();
  const maxMembers = Math.floor(input.maxMembers);
  if (!name || maxMembers < 2 || maxMembers > 10) {
    throw flatError('invalid-input');
  }
  const prefix = cityPrefix(input.city?.trim() || name);

  // A code collision is very unlikely; retry with a new code if it happens.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(prefix);
    try {
      return await runTransaction(db, async tx => {
        const userRef = doc(db, 'users', user.uid);
        const codeRef = doc(db, 'inviteCodes', code);
        const flatRef = doc(collection(db, 'flats'));

        const userSnap = await tx.get(userRef);
        const codeSnap = await tx.get(codeRef);

        if (userSnap.exists() && userSnap.data()?.flatId) {
          throw flatError('already-in-flat');
        }
        if (codeSnap.exists()) {
          throw flatError('code-taken');
        }

        const memberName = displayNameOf(userSnap.data()?.name, user);

        tx.set(flatRef, {
          name,
          address: input.address?.trim() ?? '',
          maxMembers,
          ownerId: user.uid,
          inviteCode: code,
          createdAt: serverTimestamp(),
        });
        tx.set(doc(db, 'flats', flatRef.id, 'members', user.uid), {
          name: memberName,
          role: 'owner',
          joinedAt: serverTimestamp(),
        });
        tx.set(codeRef, {
          flatId: flatRef.id,
          flatName: name,
          maxMembers,
          memberCount: 1,
        });
        tx.set(userRef, {flatId: flatRef.id}, {merge: true});

        return {flatId: flatRef.id, inviteCode: code};
      });
    } catch (e) {
      if ((e as {code?: string}).code !== 'code-taken') {
        throw e;
      }
    }
  }
  throw flatError('code-taken');
}

/** Joins the flat that owns the invite code. Fails if full or already in a flat. */
export async function joinFlat(rawCode: string) {
  const user = currentUser();
  const code = rawCode.trim().toUpperCase();
  if (!code) {
    throw flatError('invalid-code');
  }

  return runTransaction(db, async tx => {
    const userRef = doc(db, 'users', user.uid);
    const codeRef = doc(db, 'inviteCodes', code);

    const userSnap = await tx.get(userRef);
    if (userSnap.exists() && userSnap.data()?.flatId) {
      throw flatError('already-in-flat');
    }

    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists()) {
      throw flatError('invalid-code');
    }
    const {flatId, maxMembers, memberCount} = codeSnap.data() as {
      flatId: string;
      maxMembers: number;
      memberCount: number;
    };
    if (memberCount >= maxMembers) {
      throw flatError('flat-full');
    }

    tx.update(codeRef, {memberCount: memberCount + 1});
    tx.set(doc(db, 'flats', flatId, 'members', user.uid), {
      name: displayNameOf(userSnap.data()?.name, user),
      role: 'member',
      joinedAt: serverTimestamp(),
    });
    tx.set(userRef, {flatId}, {merge: true});

    return {flatId};
  });
}