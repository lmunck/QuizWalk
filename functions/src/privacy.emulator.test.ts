/**
 * Account and data deletion and the retention job against the Firestore emulator. Run from the
 * repo root with `npm run test:functions`, which starts the emulator.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { deleteAccount, deleteMyData, purgeEndedWalks } from './privacy';

let db: Firestore;
const OWNER = 'owner';
const PLAYER = 'player';
const OTHER = 'other';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with the Firestore emulator.');
  initializeApp({ projectId: 'demo-qualk' });
  db = getFirestore();
});

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-qualk/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('Could not clear the emulator');
});

const exists = async (path: string) => (await db.doc(path).get()).exists;

/** A walk with one stop, and its join code when it has one. */
async function makeWalk(
  id: string,
  status: string,
  extra: Record<string, unknown> = {},
  ownerUid = OWNER,
) {
  const ref = db.doc(`walks/${id}`);
  await ref.set({
    ownerUid,
    ownerName: 'Anders',
    title: `Walk ${id}`,
    status,
    modes: { solo: true, team: true },
    maxPlayers: 6,
    start: new GeoPoint(55.68, 12.59),
    startLabel: 'Start',
    shape: 'loop',
    route: null,
    stopCount: 1,
    distanceM: 400,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...extra,
  });
  await ref.collection('stops').doc('s1').set({ order: 0, question: 'Which one?' });
  if (typeof extra.joinCode === 'string') {
    await db.doc(`joinCodes/${extra.joinCode}`).set({ walkId: id, createdAt: Timestamp.now() });
  }
  return ref;
}

/** A team with one answer, a position and an alert: everything a participant leaves behind. */
async function addTeam(walkId: string, uid: string, team: Record<string, unknown> = {}) {
  const walk = db.doc(`walks/${walkId}`);
  await walk
    .collection('teams')
    .doc(uid)
    .set({ name: `Team ${uid}`, score: 100, startedAt: Timestamp.now(), ...team });
  await walk.collection('teams').doc(uid).collection('answers').doc('s1').set({ kind: 'answered' });
  await walk
    .collection('positions')
    .doc(uid)
    .set({ location: new GeoPoint(55.68, 12.59), accuracyM: 5, at: Timestamp.now() });
  await walk.collection('alerts').add({ teamUid: uid, stopId: 's1', kind: 'blocked' });
}

const teamLeft = async (walkId: string, uid: string) => ({
  team: await exists(`walks/${walkId}/teams/${uid}`),
  answer: await exists(`walks/${walkId}/teams/${uid}/answers/s1`),
  position: await exists(`walks/${walkId}/positions/${uid}`),
  alerts: (await db.collection(`walks/${walkId}/alerts`).where('teamUid', '==', uid).get()).size,
});

const nothing = { team: false, answer: false, position: false, alerts: 0 };
const everything = { team: true, answer: true, position: true, alerts: 1 };

describe('deleteMyData', () => {
  it("removes this install's teams, answers, positions and alerts from every walk", async () => {
    await makeWalk('open', 'open', { openFor: 'day', openedAt: Timestamp.now() });
    await makeWalk('ready', 'ready');
    await makeWalk('recent', 'ended', { endedAt: Timestamp.fromMillis(NOW - 10 * DAY) });
    // Ended long ago (its purge is overdue): found through the playing list.
    await makeWalk('listed', 'ended', { endedAt: Timestamp.fromMillis(NOW - 90 * DAY) });
    for (const w of ['open', 'ready', 'recent', 'listed']) {
      await addTeam(w, PLAYER);
      await addTeam(w, OTHER);
    }
    await db.doc(`users/${PLAYER}`).set({ playing: ['open', 'listed'], pushToken: 'x' });
    await db.doc(`questionReports/q1_${PLAYER}`).set({ uid: PLAYER, reason: 'wrong' });
    await db.doc(`questionReports/q1_${OTHER}`).set({ uid: OTHER, reason: 'wrong' });

    expect(await deleteMyData(db, PLAYER, NOW)).toEqual({ teams: 4 });

    for (const w of ['open', 'ready', 'recent', 'listed']) {
      expect(await teamLeft(w, PLAYER)).toEqual(nothing);
      expect(await teamLeft(w, OTHER)).toEqual(everything);
    }
    expect(await exists(`users/${PLAYER}`)).toBe(false);
    expect(await exists(`questionReports/q1_${PLAYER}`)).toBe(false);
    expect(await exists(`questionReports/q1_${OTHER}`)).toBe(true);
    // The walks themselves and their stops are the creator's and stay.
    expect(await exists('walks/open/stops/s1')).toBe(true);
  });

  it('tells the creator everyone has finished when the last walking team goes', async () => {
    await makeWalk('open', 'open', { openFor: 'day', openedAt: Timestamp.now() });
    await addTeam('open', OTHER, { finishedAt: Timestamp.now() });
    await addTeam('open', PLAYER); // started, still walking
    await deleteMyData(db, PLAYER, NOW);
    const walk = (await db.doc('walks/open').get()).data()!;
    expect(walk.allFinishedNotifiedAt).toBeInstanceOf(Timestamp);
    expect(await exists(`walks/open/teams/${OTHER}`)).toBe(true);
  });

  it("keeps a creator's name but drops the playing list and push token; runs twice", async () => {
    await db
      .doc(`users/${PLAYER}`)
      .set({ displayName: 'Anders', createdAt: Timestamp.now(), playing: ['x'], pushToken: 't' });
    await deleteMyData(db, PLAYER, NOW);
    expect(await deleteMyData(db, PLAYER, NOW)).toEqual({ teams: 0 });
    const user = (await db.doc(`users/${PLAYER}`).get()).data()!;
    expect(user.displayName).toBe('Anders');
    expect(user.playing).toBeUndefined();
    expect(user.pushToken).toBeUndefined();
  });
});

describe('deleteAccount', () => {
  it('deletes the walks, participant data, user doc and Auth user, and nothing else', async () => {
    await makeWalk('draft', 'draft');
    await makeWalk('ready', 'ready', { joinCode: 'K72QX' });
    await makeWalk('open', 'open', {
      joinCode: 'M4PRT',
      openFor: 'day',
      openedAt: Timestamp.now(),
    });
    await addTeam('open', OTHER);
    await makeWalk('theirs', 'open', { joinCode: 'T9WXY' }, OTHER);
    await addTeam('theirs', OWNER);
    await addTeam('theirs', PLAYER);
    await db.doc(`users/${OWNER}`).set({ displayName: 'Anders', playing: ['theirs'] });
    await db.doc(`users/${OTHER}`).set({ playing: ['open', 'theirs'] });
    await db.doc('generationJobs/draft').set({ ownerUid: OWNER, status: 'done' });
    await db.doc(`rateLimits/${OWNER}`).set({ generateWalk: [NOW] });

    const deletedAuth: string[] = [];
    const result = await deleteAccount(
      db,
      OWNER,
      async (uid) => {
        // The Auth user goes last, after every document.
        expect(await exists(`users/${uid}`)).toBe(false);
        deletedAuth.push(uid);
      },
      NOW,
    );

    expect(result).toEqual({ walks: 3, teams: 1 });
    expect(deletedAuth).toEqual([OWNER]);
    for (const w of ['draft', 'ready', 'open']) {
      expect(await exists(`walks/${w}`)).toBe(false);
      expect((await db.collection(`walks/${w}/stops`).get()).size).toBe(0);
    }
    expect(await teamLeft('open', OTHER)).toEqual(nothing);
    expect(await exists('joinCodes/K72QX')).toBe(false);
    expect(await exists('joinCodes/M4PRT')).toBe(false);
    expect(await exists('generationJobs/draft')).toBe(false);
    expect(await exists(`rateLimits/${OWNER}`)).toBe(false);
    expect(await exists(`users/${OWNER}`)).toBe(false);
    // Someone else's walk keeps everything but this account's team.
    expect(await exists('walks/theirs')).toBe(true);
    expect(await exists('joinCodes/T9WXY')).toBe(true);
    expect(await teamLeft('theirs', OWNER)).toEqual(nothing);
    expect(await teamLeft('theirs', PLAYER)).toEqual(everything);
    expect((await db.doc(`users/${OTHER}`).get()).data()?.playing).toEqual(['theirs']);
  });

  it('can run again after a failure part-way', async () => {
    await makeWalk('ready', 'ready', { joinCode: 'K72QX' });
    const fail = async () => {
      throw new Error('Auth is down');
    };
    await expect(deleteAccount(db, OWNER, fail, NOW)).rejects.toThrow('Auth is down');
    const ok: string[] = [];
    await deleteAccount(db, OWNER, async (uid) => void ok.push(uid), NOW);
    expect(ok).toEqual([OWNER]);
    expect(await exists('walks/ready')).toBe(false);
  });
});

describe('purgeEndedWalks (daily)', () => {
  it('deletes participant data and releases the code 30 days after the end', async () => {
    await makeWalk('old', 'ended', {
      joinCode: 'K72QX',
      endedAt: Timestamp.fromMillis(NOW - 31 * DAY),
      updatedAt: Timestamp.fromMillis(NOW - 31 * DAY),
    });
    await makeWalk('young', 'ended', {
      joinCode: 'M4PRT',
      endedAt: Timestamp.fromMillis(NOW - 29 * DAY),
    });
    await makeWalk('open', 'open', { joinCode: 'T9WXY' });
    for (const w of ['old', 'young', 'open']) await addTeam(w, PLAYER);
    await db.doc(`users/${PLAYER}`).set({ playing: ['old', 'young'] });

    expect(await purgeEndedWalks(db, NOW)).toEqual(['old']);

    expect(await teamLeft('old', PLAYER)).toEqual(nothing);
    expect(await exists('joinCodes/K72QX')).toBe(false);
    const old = (await db.doc('walks/old').get()).data()!;
    expect(old.joinCode).toBeUndefined();
    expect(old.participantDataDeletedAt).toBeInstanceOf(Timestamp);
    expect(old.updatedAt.toMillis()).toBe(NOW - 31 * DAY);
    expect(await exists('walks/old/stops/s1')).toBe(true);
    expect((await db.doc(`users/${PLAYER}`).get()).data()?.playing).toEqual(['young']);

    for (const w of ['young', 'open']) expect(await teamLeft(w, PLAYER)).toEqual(everything);
    expect(await exists('joinCodes/M4PRT')).toBe(true);
    expect(await exists('joinCodes/T9WXY')).toBe(true);

    // Idempotent: a second run finds nothing to do.
    expect(await purgeEndedWalks(db, NOW)).toEqual([]);
  });

  it('pages through many walks and never releases a code another walk now holds', async () => {
    for (const id of ['a', 'b', 'c']) {
      await makeWalk(id, 'ended', { endedAt: Timestamp.fromMillis(NOW - 40 * DAY) });
      await addTeam(id, PLAYER);
    }
    // Walk a's old code was given to a newer walk, so it must stay.
    await db.doc('walks/a').update({ joinCode: 'K72QX' });
    await db.doc('joinCodes/K72QX').set({ walkId: 'newer', createdAt: Timestamp.now() });

    expect((await purgeEndedWalks(db, NOW, 2)).sort()).toEqual(['a', 'b', 'c']);
    for (const id of ['a', 'b', 'c']) expect(await teamLeft(id, PLAYER)).toEqual(nothing);
    expect((await db.doc('joinCodes/K72QX').get()).data()?.walkId).toBe('newer');
  });
});
