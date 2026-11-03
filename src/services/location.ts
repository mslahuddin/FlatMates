import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  deleteField,
  Timestamp,
} from '@react-native-firebase/firestore';
import {
  check,
  request,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';

/**
 * Location sharing. Each person has one document at flats/{flatId}/locations/{uid}.
 * It only ever holds their latest position, never a history.
 */

const db = getFirestore();

/**
 * always      = "Always" allowed, can update while the app is closed
 * whenInUse   = "While using the app", updates only while the app is open
 * denied      = the person said no (or switched it off in Settings)
 * undetermined= iOS has not asked yet
 */
export type LocPermission = 'always' | 'whenInUse' | 'denied' | 'undetermined';

const WHEN_IN_USE = PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;
const ALWAYS = PERMISSIONS.IOS.LOCATION_ALWAYS;

/** What the phone currently allows, without asking. */
export async function getPermission(): Promise<LocPermission> {
  if ((await check(ALWAYS)) === RESULTS.GRANTED) {
    return 'always';
  }
  const basic = await check(WHEN_IN_USE);
  if (basic === RESULTS.GRANTED) {
    return 'whenInUse';
  }
  // DENIED on iOS means "not asked yet". BLOCKED means the person said no.
  return basic === RESULTS.DENIED ? 'undetermined' : 'denied';
}

/** Shows the iOS "Allow while using the app" prompt (only the first time). */
export async function askForPermission(): Promise<LocPermission> {
  await request(WHEN_IN_USE);
  return getPermission();
}

/** Asks to upgrade to "Always". iOS only shows this after "while using" was allowed. */
export async function askForAlways(): Promise<LocPermission> {
  await request(ALWAYS);
  return getPermission();
}

export type StoredLocation = {
  permission: LocPermission;
  sharing: boolean;
  lat: number | null;
  lng: number | null;
  updatedAt: Date | null;
};

const mine = (flatId: string) => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) {
    throw Object.assign(new Error('not-signed-in'), {code: 'not-signed-in'});
  }
  return doc(db, 'flats', flatId, 'locations', uid);
};

/** Saves my latest position for my flatmates. */
export function publishLocation(
  flatId: string,
  permission: LocPermission,
  lat: number,
  lng: number,
) {
  return setDoc(
    mine(flatId),
    {permission, sharing: true, lat, lng, updatedAt: Timestamp.now()},
    {merge: true},
  );
}

/**
 * Saves that I am not sharing, and removes my last position so nobody can see it.
 * Used when sharing is switched off or the permission is denied.
 */
export function stopSharing(flatId: string, permission: LocPermission) {
  return setDoc(
    mine(flatId),
    {
      permission,
      sharing: false,
      lat: deleteField(),
      lng: deleteField(),
      updatedAt: Timestamp.now(),
    },
    {merge: true},
  );
}