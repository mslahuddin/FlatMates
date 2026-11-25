import {getAuth} from '@react-native-firebase/auth';
import {
  getFirestore,
  doc,
  writeBatch,
} from '@react-native-firebase/firestore';

export async function transferOwnership(flatId: string, newOwnerId: string) {
  const me = getAuth().currentUser?.uid;
  if (!me || me === newOwnerId) {
    throw Object.assign(new Error('invalid-input'), {code: 'invalid-input'});
  }
  const db = getFirestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'flats', flatId), {ownerId: newOwnerId});
  batch.update(doc(db, 'flats', flatId, 'members', newOwnerId), {role: 'owner'});
  batch.update(doc(db, 'flats', flatId, 'members', me), {role: 'member'});
  await batch.commit();
}