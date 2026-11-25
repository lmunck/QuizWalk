/** users/{uid} and joinCodes/{code} (spec §6). */
import { normalizeJoinCode, type JoinCodeDoc, type UserDoc } from '@qualk/shared';
import { doc, getDoc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';

import { failed } from './errors';
import { db } from './firebase';
import { useLiveDoc, type Live, type WithId } from './hooks';

export function useUserDoc(uid: string | undefined): Live<WithId<UserDoc> | undefined> {
  return useLiveDoc<UserDoc>(uid ? `users/${uid}` : null, () => doc(db, 'users', uid!));
}

export async function setDisplayName(uid: string, displayName: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { displayName: displayName.trim(), createdAt: serverTimestamp() },
    { merge: true },
  );
}

export function setUserPushToken(uid: string, pushToken: string): void {
  setDoc(doc(db, 'users', uid), { pushToken }, { merge: true }).catch(
    failed('Could not turn on notifications'),
  );
}

export async function readUserDoc(uid: string): Promise<UserDoc | undefined> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : undefined;
}

export type CodeLookup =
  { kind: 'found'; walkId: string } | { kind: 'invalid' } | { kind: 'offline' };

/** Resolves a join code to a walk id. Needs a signed-in user (rules) and, usually, a network. */
export async function resolveJoinCode(input: string): Promise<CodeLookup> {
  const code = normalizeJoinCode(input);
  try {
    const snap = await getDoc(doc(db, 'joinCodes', code));
    if (!snap.exists()) return { kind: 'invalid' };
    return { kind: 'found', walkId: (snap.data() as JoinCodeDoc).walkId };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'firestore/unavailable') return { kind: 'offline' };
    if (code === 'firestore/permission-denied') return { kind: 'invalid' };
    throw err;
  }
}
