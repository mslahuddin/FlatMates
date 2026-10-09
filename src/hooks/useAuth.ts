import {useEffect, useState} from 'react';
import {
  getAuth,
  onAuthStateChanged,
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';

export function useAuth() {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(getAuth(), u => {
      setUser(u);
      setInitializing(false);
    });
  }, []);

  return {user, initializing};
}