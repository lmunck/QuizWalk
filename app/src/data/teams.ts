/**
 * walks/{walkId}/teams, answers, positions and alerts (spec §6). Everything a player writes
 * must work offline, so nothing here is awaited by the screens: the SDK queues the write and
 * the UI treats it as done (m1-design §5, §8).
 */
import type {
  AlertDoc,
  AnswerDoc,
  AnswerKind,
  LatLng,
  PlayMode,
  PositionDoc,
  TeamDoc,
} from '@qualk/shared';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  GeoPoint,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from '@react-native-firebase/firestore';

import { recordRejectedAnswer } from '@/lib/storage';

import { failed } from './errors';
import { db } from './firebase';
import { fromFirestore, useLiveDoc, useLiveQuery, type Live, type WithId } from './hooks';

export type Team = WithId<TeamDoc>;
export type Answer = WithId<AnswerDoc>;
export type Position = WithId<PositionDoc>;
export type Alert = WithId<AlertDoc>;

const teamRef = (walkId: string, uid: string) => doc(db, 'walks', walkId, 'teams', uid);
const answersCol = (walkId: string, uid: string) =>
  collection(db, 'walks', walkId, 'teams', uid, 'answers');
const userRef = (uid: string) => doc(db, 'users', uid);

// ------------------------------------------------------------------ reads

export function useTeams(walkId: string | undefined): Live<Team[]> {
  return useLiveQuery<TeamDoc>(walkId ? `teams/${walkId}` : null, () =>
    collection(db, 'walks', walkId!, 'teams'),
  );
}

export function useTeam(
  walkId: string | undefined,
  uid: string | undefined,
): Live<Team | undefined> {
  return useLiveDoc<TeamDoc>(walkId && uid ? `team/${walkId}/${uid}` : null, () =>
    teamRef(walkId!, uid!),
  );
}

/**
 * A team's answers, including ones still queued offline. `pendingWrites` counts those, for the
 * Offline banner ("2 answers waiting to send").
 */
export function useAnswers(
  walkId: string | undefined,
  uid: string | undefined,
): Live<Answer[]> & { pendingWrites?: number } {
  return useLiveQuery<AnswerDoc>(
    walkId && uid ? `answers/${walkId}/${uid}` : null,
    () => answersCol(walkId!, uid!),
    { includeMetadataChanges: true },
  );
}

/** Last known positions (owner only, C7). */
export function usePositions(walkId: string | undefined, enabled: boolean): Live<Position[]> {
  return useLiveQuery<PositionDoc>(enabled && walkId ? `positions/${walkId}` : null, () =>
    collection(db, 'walks', walkId!, 'positions'),
  );
}

/** Way-blocked reports (owner only, C7). */
export function useAlerts(walkId: string | undefined, enabled: boolean): Live<Alert[]> {
  return useLiveQuery<AlertDoc>(enabled && walkId ? `alerts/${walkId}` : null, () =>
    collection(db, 'walks', walkId!, 'alerts'),
  );
}

// ------------------------------------------------------------------ writes (team)

export interface JoinInput {
  walkId: string;
  uid: string;
  name: string;
  mode: PlayMode;
  players: number;
  colorIndex: number;
}

/** P1: creates the team and remembers the walk on this phone (users/{uid}.playing). */
export function joinWalk(input: JoinInput): Promise<void> {
  const batch = writeBatch(db);
  batch.set(teamRef(input.walkId, input.uid), {
    name: input.name.trim(),
    mode: input.mode,
    players: input.players,
    colorIndex: input.colorIndex,
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    distanceWalkedM: 0,
    score: 0,
    correctCount: 0,
    stopsDone: 0,
  });
  batch.set(userRef(input.uid), { playing: arrayUnion(input.walkId) }, { merge: true });
  return batch.commit();
}

export function updateTeam(
  walkId: string,
  uid: string,
  fields: Partial<Pick<TeamDoc, 'name' | 'players' | 'pushToken'>>,
): void {
  updateDoc(teamRef(walkId, uid), fields).catch(failed('Could not save your team'));
}

/**
 * Start walk. The phone's clock, not the server's: walk time is the last answer minus this
 * tap, both from the same clock (spec §4).
 */
export function startWalk(walkId: string, uid: string): void {
  updateDoc(teamRef(walkId, uid), {
    startedAt: Timestamp.now(),
    lastSeenAt: serverTimestamp(),
  }).catch(failed('Could not start the walk'));
}

/** A team that left comes back with the same code: clear `leftAt`, remember the walk again. */
export function resumeTeam(walkId: string, uid: string): void {
  const batch = writeBatch(db);
  batch.update(teamRef(walkId, uid), { leftAt: deleteField(), lastSeenAt: serverTimestamp() });
  batch.set(userRef(uid), { playing: arrayUnion(walkId) }, { merge: true });
  batch.commit().catch(failed('Could not rejoin the walk'));
}

/**
 * Leave walk. Before Start walk the team is removed; after it, the team keeps its points and
 * is marked as left (spec §4). Either way the walk is forgotten on this phone.
 */
export function leaveWalk(walkId: string, uid: string, started: boolean): void {
  const forget = setDoc(userRef(uid), { playing: arrayRemove(walkId) }, { merge: true });
  const team = started
    ? updateDoc(teamRef(walkId, uid), { leftAt: serverTimestamp() })
    : deleteDoc(teamRef(walkId, uid));
  Promise.all([forget, team]).catch(failed('Could not leave the walk'));
}

/** Forget a finished or ended walk on this phone without touching the team. */
export function forgetWalk(uid: string, walkId: string): void {
  setDoc(userRef(uid), { playing: arrayRemove(walkId) }, { merge: true }).catch(
    failed('Could not remove the walk'),
  );
}

export function reportDistance(walkId: string, uid: string, distanceWalkedM: number): void {
  updateDoc(teamRef(walkId, uid), {
    distanceWalkedM: Math.round(distanceWalkedM),
    lastSeenAt: serverTimestamp(),
  }).catch(() => undefined);
}

export interface AnswerInput {
  kind: AnswerKind;
  choiceIndex?: number;
  openedAtMs: number;
  answeredAtMs: number;
}

function answerFields(a: AnswerInput) {
  return {
    kind: a.kind,
    ...(a.kind !== 'skipped' && a.choiceIndex !== undefined ? { choiceIndex: a.choiceIndex } : {}),
    openedAtClient: Timestamp.fromMillis(a.openedAtMs),
    answeredAtClient: Timestamp.fromMillis(a.answeredAtMs),
    elapsedMs: Math.max(0, a.answeredAtMs - a.openedAtMs),
  };
}

/**
 * Writes one answer. Not awaited: offline it is queued. If the server refuses it later (the
 * walk ended before it synced, spec §4), it is remembered so P6 can say so.
 */
export function submitAnswer(walkId: string, uid: string, stopId: string, a: AnswerInput): void {
  setDoc(doc(answersCol(walkId, uid), stopId), answerFields(a)).catch((err: unknown) => {
    void recordRejectedAnswer(walkId, stopId);
    console.warn('Answer was not accepted', err);
  });
}

/** Way blocked: a skip and an alert to the creator, in one step (G6). */
export function reportBlocked(walkId: string, uid: string, stopId: string, nowMs: number): void {
  const batch = writeBatch(db);
  batch.set(
    doc(answersCol(walkId, uid), stopId),
    answerFields({
      kind: 'skipped',
      openedAtMs: nowMs,
      answeredAtMs: nowMs,
    }),
  );
  batch.set(doc(collection(db, 'walks', walkId, 'alerts')), {
    teamUid: uid,
    stopId,
    kind: 'blocked',
    createdAt: serverTimestamp(),
    resolved: false,
  });
  batch.commit().catch((err: unknown) => {
    void recordRejectedAnswer(walkId, stopId);
    console.warn('Blocked report was not accepted', err);
  });
}

/** Last known position, overwritten (§9 Uploads). */
export function uploadPosition(walkId: string, uid: string, at: LatLng, accuracyM: number): void {
  setDoc(doc(db, 'walks', walkId, 'positions', uid), {
    location: new GeoPoint(at.latitude, at.longitude),
    accuracyM: Math.round(accuracyM),
    at: serverTimestamp(),
  }).catch(() => undefined);
}

export function resolveAlert(walkId: string, alertId: string): void {
  updateDoc(doc(db, 'walks', walkId, 'alerts', alertId), { resolved: true }).catch(
    failed('Could not update the alert'),
  );
}

/** One read of this phone's team in a walk, for the join and resume decision. */
export async function readTeam(walkId: string, uid: string): Promise<Team | undefined> {
  const snap = await getDoc(teamRef(walkId, uid));
  return snap.exists()
    ? ({ id: snap.id, ...(fromFirestore(snap.data()) as TeamDoc) } as Team)
    : undefined;
}
