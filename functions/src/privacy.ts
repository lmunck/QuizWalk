/**
 * Account and data deletion, and the 30-day retention job (spec §6, §8, §13; M5 row 1). Written
 * against a Firestore handle like core.ts, so the emulator tests run it without the Functions
 * runtime. The decisions behind it are in docs/m5-privacy-delivery.md.
 *
 * What belongs to a person:
 * - as a creator: their walks (with stops, teams, answers, positions, alerts and join code),
 *   generation jobs, rate-limit counters and `users/{uid}`;
 * - as a participant (anonymous or not): `walks/{w}/teams/{uid}` with its answers,
 *   `walks/{w}/positions/{uid}`, alerts with `teamUid == uid`, question reports with
 *   `uid == uid`, and the `playing` list and push token on `users/{uid}`.
 */
import {
  FieldValue,
  Timestamp,
  type BulkWriter,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

import { pushFinishNews } from './push';

/** Participant data is kept for 30 days after a walk ends (spec §6, §13). */
export const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far back *Delete my data* looks for ended walks: twice the retention period, so a walk
 * still has its teams found if the daily job missed a few days.
 */
const LOOKBACK_DAYS = 2 * RETENTION_DAYS;

const isDocId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 1500 && !v.includes('/');

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A join code is deleted only while it still points at this walk, so it is never someone else's. */
async function releaseJoinCode(db: Firestore, walkId: string, code: unknown): Promise<void> {
  if (!isDocId(code)) return;
  const ref = db.doc(`joinCodes/${code}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data()?.walkId === walkId) tx.delete(ref);
  });
}

/**
 * Runs a set of writes through one BulkWriter (batched, with retries) and fails if any of them
 * failed, so a caller never reports a deletion that did not happen.
 */
async function bulk(db: Firestore, write: (w: BulkWriter) => Promise<unknown>[]): Promise<void> {
  const writer = db.bulkWriter();
  const results = Promise.allSettled(write(writer));
  await writer.close();
  const failed = (await results).find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}

/** Deletes the given documents in batches. Missing ones are fine. */
async function deleteAll(db: Firestore, refs: DocumentReference[]): Promise<void> {
  if (refs.length > 0) await bulk(db, (w) => refs.map((ref) => w.delete(ref)));
}

/** Takes a walk off every `users/{uid}.playing` list (Home's Playing section, spec §6). */
async function forgetInPlayingLists(db: Firestore, walkId: string): Promise<void> {
  const users = await db.collection('users').where('playing', 'array-contains', walkId).get();
  if (users.empty) return;
  const NOT_FOUND = 5; // a user deleted meanwhile has nothing left to trim
  await bulk(db, (w) =>
    users.docs.map((u) =>
      w.update(u.ref, { playing: FieldValue.arrayRemove(walkId) }).catch((err: unknown) => {
        if ((err as { code?: number }).code !== NOT_FOUND) throw err;
      }),
    ),
  );
}

// ------------------------------------------------------------------ participant data

/**
 * The walks that can still hold this person's team: every walk that is ready or open, every
 * walk that ended in the last 60 days, and the walks on their `playing` list. Teams can only
 * be created while a walk is ready or open, and the daily job removes them 30 days after the
 * end, so nothing older can have one. Three single-field queries, no composite index.
 */
async function walksThatMayHoldTeam(db: Firestore, uid: string, nowMs: number) {
  const since = Timestamp.fromMillis(nowMs - LOOKBACK_DAYS * DAY_MS);
  const walks = db.collection('walks');
  const [active, recent, user] = await Promise.all([
    walks.where('status', 'in', ['ready', 'open']).select().get(),
    walks.where('endedAt', '>=', since).select().get(),
    db.doc(`users/${uid}`).get(),
  ]);
  const ids = new Set<string>([...active.docs, ...recent.docs].map((d) => d.id));
  const playing: unknown = user.data()?.playing;
  if (Array.isArray(playing)) for (const w of playing) if (isDocId(w)) ids.add(w);
  return [...ids];
}

/**
 * Removes one person's teams (with their answers), positions and alerts from every walk, and
 * their question reports. A team removed from an open walk disappears from everyone's
 * standings at once, since ranks are derived from the teams that exist (spec §4); if it was the
 * last team still walking, the creator hears that everyone has finished.
 */
export async function deleteParticipantData(
  db: Firestore,
  uid: string,
  nowMs = Date.now(),
): Promise<{ teams: number }> {
  const walkIds = await walksThatMayHoldTeam(db, uid, nowMs);
  let teams = 0;

  for (const group of chunks(walkIds, 100)) {
    const teamRefs = group.map((w) => db.doc(`walks/${w}/teams/${uid}`));
    const positionRefs = group.map((w) => db.doc(`walks/${w}/positions/${uid}`));
    const [snaps, alerts] = await Promise.all([
      db.getAll(...teamRefs, ...positionRefs),
      Promise.all(
        group.map((w) =>
          db.collection(`walks/${w}/alerts`).where('teamUid', '==', uid).select().get(),
        ),
      ),
    ]);
    const teamSnaps = snaps.slice(0, group.length);
    const positionSnaps = snaps.slice(group.length);

    await deleteAll(db, [
      ...positionSnaps.filter((s) => s.exists).map((s) => s.ref),
      ...alerts.flatMap((a) => a.docs.map((d) => d.ref)),
    ]);
    for (const team of teamSnaps) {
      if (!team.exists) continue;
      await db.recursiveDelete(team.ref);
      teams++;
      const walkId = team.ref.parent.parent!.id;
      // The team is gone, so this only checks whether the teams left have all finished.
      await pushFinishNews(db, walkId, uid, true);
    }
  }

  const reports = await db.collection('questionReports').where('uid', '==', uid).select().get();
  await deleteAll(
    db,
    reports.docs.map((d) => d.ref),
  );
  return { teams };
}

/**
 * Participant *Delete my data* (S1, spec §13): everything above, plus the `playing` list and
 * the push token on `users/{uid}`. The account itself stays, so an anonymous install keeps
 * working and a creator keeps their walks.
 */
export async function deleteMyData(
  db: Firestore,
  uid: string,
  nowMs = Date.now(),
): Promise<{ teams: number }> {
  const result = await deleteParticipantData(db, uid, nowMs);
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) return;
    const rest = Object.keys(snap.data() ?? {}).filter((k) => k !== 'playing' && k !== 'pushToken');
    // A participant's doc holds only `playing` (spec §6), so it usually goes entirely.
    if (rest.length === 0 || (rest.length === 1 && rest[0] === 'createdAt')) tx.delete(userRef);
    else tx.update(userRef, { playing: FieldValue.delete(), pushToken: FieldValue.delete() });
  });
  return result;
}

// ------------------------------------------------------------------ account

/** One of the account's walks, whatever its status, with everything under it. */
async function deleteOwnedWalk(db: Firestore, walk: QueryDocumentSnapshot): Promise<void> {
  await releaseJoinCode(db, walk.id, walk.data().joinCode);
  await forgetInPlayingLists(db, walk.id);
  await db.doc(`generationJobs/${walk.id}`).delete();
  await db.recursiveDelete(walk.ref);
}

/**
 * deleteAccount (S1 *Delete account and all data*, spec §8): the person's walks recursively,
 * open ones included, their participant data in other walks, their generation jobs and
 * counters, `users/{uid}`, and last the Auth user. Each step can run again, so a failure
 * part-way is fixed by trying again; the Auth user goes last so that a retry is still signed in.
 */
export async function deleteAccount(
  db: Firestore,
  uid: string,
  deleteAuthUser: (uid: string) => Promise<void>,
  nowMs = Date.now(),
): Promise<{ walks: number; teams: number }> {
  const owned = await db.collection('walks').where('ownerUid', '==', uid).get();
  for (const walk of owned.docs) await deleteOwnedWalk(db, walk);

  const { teams } = await deleteParticipantData(db, uid, nowMs);

  const jobs = await db.collection('generationJobs').where('ownerUid', '==', uid).select().get();
  await deleteAll(db, [...jobs.docs.map((d) => d.ref), db.doc(`rateLimits/${uid}`)]);
  await db.recursiveDelete(db.doc(`users/${uid}`));

  await deleteAuthUser(uid);
  return { walks: owned.size, teams };
}

// ------------------------------------------------------------------ retention

/** One ended walk past retention: participant data out, join code released, walk marked. */
async function purgeWalk(db: Firestore, ref: DocumentReference, walk: DocumentData) {
  await db.recursiveDelete(ref.collection('teams'));
  await db.recursiveDelete(ref.collection('positions'));
  await db.recursiveDelete(ref.collection('alerts'));
  await releaseJoinCode(db, ref.id, walk.joinCode);
  await forgetInPlayingLists(db, ref.id);
  // Marked last, so a run that stops part-way is finished by the next one. `updatedAt` is left
  // alone: Home sorts by it, and an old walk should not jump to the top.
  await ref.update({
    joinCode: FieldValue.delete(),
    participantDataDeletedAt: FieldValue.serverTimestamp(),
  });
}

/**
 * daily: 30 days after `endedAt`, delete a walk's teams, answers, positions and alerts and
 * release its join code (spec §6, §8). The walk, its stops and its questions stay with the
 * creator. Safe to run any number of times: walks already done carry
 * `participantDataDeletedAt` and are skipped. Walks are read a page at a time.
 */
export async function purgeEndedWalks(
  db: Firestore,
  nowMs = Date.now(),
  pageSize = 100,
): Promise<string[]> {
  const cutoff = Timestamp.fromMillis(nowMs - RETENTION_DAYS * DAY_MS);
  const purged: string[] = [];
  let after: QueryDocumentSnapshot | undefined;
  for (;;) {
    let page = db
      .collection('walks')
      .where('endedAt', '<=', cutoff)
      .orderBy('endedAt')
      // endedAt too: the page cursor needs the field it orders by.
      .select('endedAt', 'joinCode', 'participantDataDeletedAt')
      .limit(pageSize);
    if (after) page = page.startAfter(after);
    const snap = await page.get();
    for (const d of snap.docs) {
      if (d.data().participantDataDeletedAt) continue;
      await purgeWalk(db, d.ref, d.data());
      purged.push(d.id);
    }
    if (snap.size < pageSize) break;
    after = snap.docs[snap.docs.length - 1];
  }
  return purged;
}
