/** Callable Cloud Functions (spec §8). These need a connection; callers show their errors. */
import type { WalkOpenFor, WalkProblem } from '@qualk/shared';
import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from './firebase';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const fn = httpsCallable<In, Out>(functions, name);
  const res = await fn(data);
  return res.data;
}

export function publishWalk(walkId: string) {
  return call<{ walkId: string }, { joinCode: string }>('publishWalk', { walkId });
}

export function openWalk(walkId: string, openFor: WalkOpenFor) {
  return call<
    { walkId: string; openFor: WalkOpenFor },
    { openedAtMs: number; openFor: WalkOpenFor }
  >('openWalk', { walkId, openFor });
}

export function deleteWalk(walkId: string) {
  return call<{ walkId: string }, { ok: true }>('deleteWalk', { walkId });
}

export function duplicateWalk(walkId: string) {
  return call<{ walkId: string }, { walkId: string }>('duplicateWalk', { walkId });
}

/** S1 *Delete my data*: this install's teams, answers, positions and playing list (spec §13). */
export function deleteMyData() {
  return call<Record<string, never>, { teams: number }>('deleteMyData', {});
}

/** S1 *Delete account and all data*: walks, participant data and the account (spec §8). */
export function deleteAccount() {
  return call<Record<string, never>, { walks: number; teams: number }>('deleteAccount', {});
}

/** The problems a refused publish or open carries, for listing them (C4, C6). */
export function problemsFrom(err: unknown): WalkProblem[] {
  const details = (err as { details?: { problems?: WalkProblem[] } }).details;
  return Array.isArray(details?.problems) ? details.problems : [];
}
