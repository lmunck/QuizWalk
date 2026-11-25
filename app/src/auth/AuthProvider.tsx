/**
 * Owns auth state: `{ user, isCreator, loading }` (m1-design §6). Everyone is signed in
 * anonymously on first launch; creators link Apple or Google on top.
 */
import { onIdTokenChanged, signInAnonymously, type User } from '@react-native-firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { auth } from '@/data/firebase';
import { useUserDoc } from '@/data/users';

interface AuthState {
  uid?: string;
  /** Signed in with Apple or Google; a property of the account, not a role in the database. */
  isCreator: boolean;
  /** The creator's name as players see it, from users/{uid}. */
  displayName?: string;
  /** Joined walks on this phone (users/{uid}.playing). */
  playing: string[];
  /** Whether users/{uid} has loaded at least once. */
  userLoaded: boolean;
  loading: boolean;
  error?: string;
  /** The provider's name for the account ("Apple" or "Google"). */
  providerName?: string;
  email?: string;
}

const AuthContext = createContext<AuthState>({
  isCreator: false,
  playing: [],
  userLoaded: false,
  loading: true,
});

function providerName(user: User): string | undefined {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes('apple.com')) return 'Apple';
  if (ids.includes('google.com')) return 'Google';
  return undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Linking keeps the same User object, so a counter makes the change visible to React.
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // onIdTokenChanged also fires when an anonymous user is linked to Apple or Google.
  useEffect(
    () =>
      onIdTokenChanged(auth, (next) => {
        if (next) {
          setUser(next);
          setVersion((v) => v + 1);
          setLoading(false);
          setError(undefined);
          return;
        }
        // Rules need a signed-in user for everything, including resolving a join code.
        signInAnonymously(auth).catch((err: unknown) => {
          console.warn('Anonymous sign-in failed', err);
          setError("Couldn't connect. Check your connection and reopen QuizWalk.");
          setLoading(false);
        });
      }),
    [],
  );

  const userDoc = useUserDoc(user?.uid);

  const value = useMemo<AuthState>(
    () => ({
      uid: user?.uid,
      isCreator: !!user && !user.isAnonymous,
      displayName: userDoc.data?.displayName,
      playing: userDoc.data?.playing ?? [],
      userLoaded: !!user && !userDoc.loading,
      loading,
      error,
      providerName: user ? providerName(user) : undefined,
      email: user?.email ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, version, userDoc.data, userDoc.loading, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
