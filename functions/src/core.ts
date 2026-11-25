/**
 * The work behind each function, written against a Firestore handle so the tests can run it
 * on the emulator without the Functions runtime. The exported functions in index.ts are thin
 * shells around these.
 */
import { randomInt } from 'node:crypto';

import {
  generateJoinCode,
  recomputeTeamTotals,
  walkDistanceM,
  walkEndsAtMs,
  walkProblems,
  type LatLng,
  type StopWarning,
  type SubmittedAnswer,
  type WalkOpenFor,
  type WalkProblem,
} from '@qualk/shared';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type GeoPoint,
  Timestamp,
} from 'firebase-admin/firestore';

/** A failure the caller can show as it is. Callables turn it into an HttpsError. */
export class QualkError extends Error {
  constructor(
    readonly code: 'not-found' | 'permission-denied' | 'failed-precondition' | 'invalid-argument',
    message: string,
    readonly problems?: WalkProblem[],
  ) {
    super(message);
  }
}

const toLatLng = (g: GeoPoint): LatLng => ({ latitude: g.latitude, longitude: g.longitude });

interface StopRow {
  id: string;
  order: number;
  location: GeoPoint;
  question: string;
  options: string[];
  correctIndex: number;
  skippedForAll: boolean;
  warnings?: StopWarning[];
}

async function ownedWalk(db: Firestore, uid: string, walkId: string) {
  if (typeof walkId !== 'string' || walkId.length === 0 || walkId.includes('/')) {
    throw new QualkError('invalid-argument', 'No walk given.');
  }
  const ref = db.doc(`walks/${walkId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new QualkError('not-found', 'This walk no longer exists.');
  const walk = snap.data()!;
  if (walk.ownerUid !== uid) throw new QualkError('permission-denied', 'This is not your walk.');
  return { ref, walk };
}

async function readStops(walkRef: DocumentReference): Promise<StopRow[]> {
  const snap = await walkRef.collection('stops').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<StopRow, 'id'>) }))
    .sort((a, b) => a.order - b.order);
}

/** The owner's current name, so a name set or changed after creating the walk reaches players. */
async function ownerNameFor(db: Firestore, uid: string, fallback: string): Promise<string> {
  const name = (await db.doc(`users/${uid}`).get()).data()?.displayName;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : fallback;
}

/** Checks a walk with the same rules the phone uses, and returns its stop count and distance. */
async function validated(walkRef: DocumentReference, walk: FirebaseFirestore.DocumentData) {
  const stops = await readStops(walkRef);
  const problems = walkProblems({ title: walk.title ?? '' }, stops);
  if (problems.blocking.length > 0) {
    const first = problems.blocking[0]!.message;
    const more = problems.blocking.length - 1;
    throw new QualkError(
      'failed-precondition',
      more > 0 ? `${first}, and ${more} more to fix.` : `${first}.`,
      problems.blocking,
    );
  }
  return {
    stopCount: stops.length,
    distanceM: Math.round(
      walkDistanceM(
        toLatLng(walk.start),
        stops.map((s) => toLatLng(s.location)),
      ),
    ),
  };
}

/** publishWalk: validate, allocate a join code, draft → ready. Idempotent for a ready walk. */
export async function publishWalk(
  db: Firestore,
  uid: string,
  walkId: string,
  random: (n: number) => number = randomInt,
): Promise<{ joinCode: string }> {
  const { ref, walk } = await ownedWalk(db, uid, walkId);
  const ownerName = await ownerNameFor(db, uid, walk.ownerName ?? '');
  if (walk.status === 'ready' && walk.joinCode) {
    const totals = await validated(ref, walk);
    await ref.update({ ...totals, ownerName, updatedAt: FieldValue.serverTimestamp() });
    return { joinCode: walk.joinCode };
  }
  if (walk.status !== 'draft') {
    throw new QualkError('failed-precondition', 'This walk has already been published.');
  }
  const totals = await validated(ref, walk);

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode(random);
    const codeRef = db.doc(`joinCodes/${code}`);
    const claimed = await db.runTransaction(async (tx) => {
      const [codeSnap, walkSnap] = await Promise.all([tx.get(codeRef), tx.get(ref)]);
      if (codeSnap.exists) return false;
      if (walkSnap.data()?.status !== 'draft') {
        throw new QualkError('failed-precondition', 'This walk has already been published.');
      }
      tx.create(codeRef, { walkId, createdAt: FieldValue.serverTimestamp() });
      tx.update(ref, {
        ...totals,
        ownerName,
        status: 'ready',
        joinCode: code,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (claimed) return { joinCode: code };
  }
  throw new Error('Could not find a free join code after 10 tries.');
}

/** openWalk: validate again, then ready → open with how long it stays open. */
export async function openWalk(
  db: Firestore,
  uid: string,
  walkId: string,
  openFor: WalkOpenFor,
): Promise<{ openedAtMs: number; openFor: WalkOpenFor }> {
  if (openFor !== 'day' && openFor !== 'week') {
    throw new QualkError('invalid-argument', 'Choose Today or This week.');
  }
  const { ref, walk } = await ownedWalk(db, uid, walkId);
  if (walk.status === 'open') {
    return { openedAtMs: (walk.openedAt as Timestamp).toMillis(), openFor: walk.openFor ?? 'day' };
  }
  if (walk.status !== 'ready') {
    throw new QualkError('failed-precondition', 'Publish the walk before opening it.');
  }
  const totals = await validated(ref, walk);
  const openedAt = Timestamp.now();
  await ref.update({
    ...totals,
    ownerName: await ownerNameFor(db, uid, walk.ownerName ?? ''),
    status: 'open',
    openFor,
    openedAt,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { openedAtMs: openedAt.toMillis(), openFor };
}

/**
 * Derives one team's totals from scratch (spec §8, m1-design §5 "Idempotent totals") and
 * writes points onto each answer. Safe to run any number of times.
 */
export async function recomputeTeam(db: Firestore, walkId: string, teamUid: string) {
  const walkRef = db.doc(`walks/${walkId}`);
  const teamRef = walkRef.collection('teams').doc(teamUid);

  await db.runTransaction(async (tx) => {
    const [teamSnap, answersSnap, stopsSnap] = await Promise.all([
      tx.get(teamRef),
      tx.get(teamRef.collection('answers')),
      tx.get(walkRef.collection('stops')),
    ]);
    if (!teamSnap.exists) return;

    const answers: SubmittedAnswer[] = answersSnap.docs.map((d) => {
      const a = d.data();
      return {
        stopId: d.id,
        kind: a.kind,
        choiceIndex: a.choiceIndex,
        openedAtClientMs: (a.openedAtClient as Timestamp).toMillis(),
        answeredAtClientMs: (a.answeredAtClient as Timestamp).toMillis(),
        elapsedMs: a.elapsedMs,
      };
    });
    const stops = stopsSnap.docs.map((d) => ({
      id: d.id,
      correctIndex: d.data().correctIndex as number,
      skippedForAll: d.data().skippedForAll === true,
    }));
    const totals = recomputeTeamTotals(answers, stops);

    for (const d of answersSnap.docs) {
      const scored = totals.perStop[d.id];
      if (!scored) continue;
      const cur = d.data();
      if (cur.points !== scored.points || cur.correct !== scored.correct) {
        tx.update(d.ref, { points: scored.points, correct: scored.correct });
      }
    }
    tx.update(teamRef, {
      score: totals.score,
      correctCount: totals.correctCount,
      stopsDone: totals.stopsDone,
      finishedAt:
        totals.finishedAtMs === undefined
          ? FieldValue.delete()
          : Timestamp.fromMillis(totals.finishedAtMs),
    });
  });
}

/** Skip for everyone: every team's totals are derived again. */
export async function recomputeAllTeams(db: Firestore, walkId: string) {
  const teams = await db.collection(`walks/${walkId}/teams`).get();
  for (const t of teams.docs) await recomputeTeam(db, walkId, t.id);
}

/** hourly: end open walks past their time (12 hours, or 7 days for a week-long walk). */
export async function endExpiredWalks(db: Firestore, nowMs = Date.now()): Promise<string[]> {
  const open = await db.collection('walks').where('status', '==', 'open').get();
  const ended: string[] = [];
  for (const d of open.docs) {
    const w = d.data();
    const openedAt = w.openedAt as Timestamp | undefined;
    if (!openedAt) continue;
    if (nowMs >= walkEndsAtMs(openedAt.toMillis(), w.openFor ?? 'day')) {
      await d.ref.update({
        status: 'ended',
        endedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      ended.push(d.id);
    }
  }
  return ended;
}

/** deleteWalk: anything not open, with all its subcollections and its join code. */
export async function deleteWalk(db: Firestore, uid: string, walkId: string) {
  const { ref, walk } = await ownedWalk(db, uid, walkId);
  if (walk.status === 'open') {
    throw new QualkError('failed-precondition', 'End the walk before deleting it.');
  }
  if (walk.joinCode) await db.doc(`joinCodes/${walk.joinCode}`).delete();
  await db.recursiveDelete(ref);
}

/** duplicateWalk ("Reuse walk"): a new draft with the same stops and questions. */
export async function duplicateWalk(
  db: Firestore,
  uid: string,
  walkId: string,
): Promise<{ walkId: string }> {
  const { ref, walk } = await ownedWalk(db, uid, walkId);
  const stops = await ref.collection('stops').get();
  const copy = db.collection('walks').doc();
  const batch = db.batch();
  batch.set(copy, {
    ownerUid: uid,
    ownerName: walk.ownerName ?? '',
    title: walk.title,
    ...(walk.topic ? { topic: walk.topic } : {}),
    ...(walk.difficulty ? { difficulty: walk.difficulty } : {}),
    status: 'draft',
    modes: walk.modes ?? { solo: true, team: true },
    maxPlayers: walk.maxPlayers ?? 6,
    ...(walk.whenText ? { whenText: walk.whenText } : {}),
    start: walk.start,
    startLabel: walk.startLabel ?? '',
    shape: walk.shape ?? 'loop',
    route: walk.route ?? null,
    stopCount: stops.size,
    distanceM: walk.distanceM ?? 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const s of stops.docs) {
    batch.set(copy.collection('stops').doc(), { ...s.data(), skippedForAll: false });
  }
  await batch.commit();
  return { walkId: copy.id };
}
