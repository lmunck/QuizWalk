/**
 * Function logic against the Firestore emulator. Run from the repo root with
 * `npm run test:functions`, which starts the emulator.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteWalk,
  duplicateWalk,
  endExpiredWalks,
  openWalk,
  publishWalk,
  QualkError,
  recomputeAllTeams,
  recomputeTeam,
} from './core';
import { pushFinishNews } from './push';

let db: Firestore;
const OWNER = 'owner';

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

function stop(order: number, overrides: Record<string, unknown> = {}) {
  return {
    order,
    location: new GeoPoint(55.68 + order * 0.001, 12.59),
    placeName: `Stop ${order + 1}`,
    radiusM: 40,
    question: 'Which one?',
    options: ['Right', 'Wrong'],
    correctIndex: 0,
    explanation: '',
    origin: 'manual',
    warnings: [],
    skippedForAll: false,
    ...overrides,
  };
}

async function makeWalk(
  status: string,
  stops: Record<string, unknown>[] = [stop(0), stop(1)],
  extra: Record<string, unknown> = {},
) {
  const ref = db.collection('walks').doc();
  await ref.set({
    ownerUid: OWNER,
    ownerName: 'Anders',
    title: 'Harbour history',
    status,
    modes: { solo: true, team: true },
    maxPlayers: 6,
    start: new GeoPoint(55.68, 12.59),
    startLabel: 'Start',
    shape: 'loop',
    route: null,
    stopCount: 0,
    distanceM: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...extra,
  });
  const ids: string[] = [];
  for (const s of stops) {
    const sref = ref.collection('stops').doc();
    await sref.set(s);
    ids.push(sref.id);
  }
  return { walkId: ref.id, stopIds: ids };
}

async function expectQualkError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(QualkError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('publishWalk', () => {
  it('allocates a join code and moves draft → ready with totals', async () => {
    const { walkId } = await makeWalk('draft');
    const { joinCode } = await publishWalk(db, OWNER, walkId);
    expect(joinCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    const walk = (await db.doc(`walks/${walkId}`).get()).data()!;
    expect(walk.status).toBe('ready');
    expect(walk.joinCode).toBe(joinCode);
    expect(walk.stopCount).toBe(2);
    expect(walk.distanceM).toBe(111); // start → stop 1 (same spot) → stop 2, 0.001° north
    expect((await db.doc(`joinCodes/${joinCode}`).get()).data()?.walkId).toBe(walkId);
  });

  it('returns the same code when published again', async () => {
    const { walkId } = await makeWalk('draft');
    const first = await publishWalk(db, OWNER, walkId);
    expect(await publishWalk(db, OWNER, walkId)).toEqual(first);
  });

  it('skips a code that is taken', async () => {
    await db.doc('joinCodes/22222').set({ walkId: 'other', createdAt: Timestamp.now() });
    const { walkId } = await makeWalk('draft');
    let calls = 0;
    const { joinCode } = await publishWalk(db, OWNER, walkId, () => (calls++ < 5 ? 0 : 1));
    expect(joinCode).toBe('33333');
  });

  it('lists what blocks publishing', async () => {
    const { walkId } = await makeWalk('draft', [
      stop(0, { question: '' }),
      stop(1, { correctIndex: 5 }),
    ]);
    const p = publishWalk(db, OWNER, walkId);
    await expectQualkError(p, 'failed-precondition');
    await expect(p).rejects.toMatchObject({
      message: 'Stop 1 needs a question, and 1 more to fix.',
    });
  });

  it('refuses walks without stops and other people’s walks', async () => {
    const empty = await makeWalk('draft', []);
    await expectQualkError(publishWalk(db, OWNER, empty.walkId), 'failed-precondition');
    const { walkId } = await makeWalk('draft');
    await expectQualkError(publishWalk(db, 'someone', walkId), 'permission-denied');
    await expectQualkError(publishWalk(db, OWNER, 'missing'), 'not-found');
  });
});

describe('openWalk', () => {
  it('opens a ready walk for a day or a week', async () => {
    const { walkId } = await makeWalk('ready', undefined, { joinCode: 'K72QX' });
    const res = await openWalk(db, OWNER, walkId, 'week');
    expect(res.openFor).toBe('week');
    const walk = (await db.doc(`walks/${walkId}`).get()).data()!;
    expect(walk.status).toBe('open');
    expect(walk.openFor).toBe('week');
    expect(walk.openedAt).toBeInstanceOf(Timestamp);
  });

  it('checks the walk again, refuses drafts and bad choices', async () => {
    const broken = await makeWalk('ready', [stop(0, { options: ['Only one'] })]);
    await expectQualkError(openWalk(db, OWNER, broken.walkId, 'day'), 'failed-precondition');
    const draft = await makeWalk('draft');
    await expectQualkError(openWalk(db, OWNER, draft.walkId, 'day'), 'failed-precondition');
    await expectQualkError(openWalk(db, OWNER, draft.walkId, 'month' as 'day'), 'invalid-argument');
  });
});

describe('recomputeTeam', () => {
  async function setup() {
    const { walkId, stopIds } = await makeWalk('open');
    const team = db.doc(`walks/${walkId}/teams/t1`);
    await team.set({
      name: 'Fjord Kids',
      score: 0,
      correctCount: 0,
      stopsDone: 0,
      startedAt: Timestamp.now(),
    });
    return { walkId, stopIds, team };
  }

  function answer(choiceIndex: number | null, elapsedMs: number, atMs: number) {
    return {
      kind: choiceIndex === null ? 'skipped' : 'answered',
      ...(choiceIndex === null ? {} : { choiceIndex }),
      openedAtClient: Timestamp.fromMillis(atMs - elapsedMs),
      answeredAtClient: Timestamp.fromMillis(atMs),
      elapsedMs,
    };
  }

  it('scores answers and sets finishedAt from the last answer', async () => {
    const { walkId, stopIds, team } = await setup();
    await team
      .collection('answers')
      .doc(stopIds[0]!)
      .set(answer(0, 6_000, 1_000_000));
    await recomputeTeam(db, walkId, 't1');
    let t = (await team.get()).data()!;
    expect(t).toMatchObject({ score: 14, correctCount: 1, stopsDone: 1 });
    expect(t.finishedAt).toBeUndefined();
    expect((await team.collection('answers').doc(stopIds[0]!).get()).data()).toMatchObject({
      points: 14,
      correct: true,
    });

    await team
      .collection('answers')
      .doc(stopIds[1]!)
      .set(answer(1, 3_000, 2_000_000));
    await recomputeTeam(db, walkId, 't1');
    await recomputeTeam(db, walkId, 't1'); // idempotent
    t = (await team.get()).data()!;
    expect(t).toMatchObject({ score: 14, correctCount: 1, stopsDone: 2 });
    expect((t.finishedAt as Timestamp).toMillis()).toBe(2_000_000);
  });

  it('voids points on a stop skipped for everyone', async () => {
    const { walkId, stopIds, team } = await setup();
    await team
      .collection('answers')
      .doc(stopIds[0]!)
      .set(answer(0, 1_000, 1_000_000));
    await recomputeTeam(db, walkId, 't1');
    await db.doc(`walks/${walkId}/stops/${stopIds[0]}`).update({ skippedForAll: true });
    await recomputeAllTeams(db, walkId);
    const t = (await team.get()).data()!;
    expect(t).toMatchObject({ score: 0, correctCount: 0, stopsDone: 0 });
  });
});

describe('endExpiredWalks', () => {
  it('ends day walks after 12 hours and week walks after 7 days', async () => {
    const now = Date.now();
    const hour = 3_600_000;
    const day = await makeWalk('open', [], { openedAt: Timestamp.fromMillis(now - 13 * hour) });
    const dayYoung = await makeWalk('open', [], { openedAt: Timestamp.fromMillis(now - 2 * hour) });
    const week = await makeWalk('open', [], {
      openFor: 'week',
      openedAt: Timestamp.fromMillis(now - 2 * 24 * hour),
    });
    const weekOld = await makeWalk('open', [], {
      openFor: 'week',
      openedAt: Timestamp.fromMillis(now - 8 * 24 * hour),
    });
    const ended = await endExpiredWalks(db, now);
    expect(ended.sort()).toEqual([day.walkId, weekOld.walkId].sort());
    expect((await db.doc(`walks/${dayYoung.walkId}`).get()).data()?.status).toBe('open');
    expect((await db.doc(`walks/${week.walkId}`).get()).data()?.status).toBe('open');
    expect((await db.doc(`walks/${day.walkId}`).get()).data()?.endedAt).toBeInstanceOf(Timestamp);
  });
});

describe('deleteWalk and duplicateWalk', () => {
  it('deletes a published walk with its subcollections and code', async () => {
    const { walkId } = await makeWalk('draft');
    const { joinCode } = await publishWalk(db, OWNER, walkId);
    await db.doc(`walks/${walkId}/teams/t1`).set({ name: 'x' });
    await deleteWalk(db, OWNER, walkId);
    expect((await db.doc(`walks/${walkId}`).get()).exists).toBe(false);
    expect((await db.collection(`walks/${walkId}/stops`).get()).size).toBe(0);
    expect((await db.doc(`walks/${walkId}/teams/t1`).get()).exists).toBe(false);
    expect((await db.doc(`joinCodes/${joinCode}`).get()).exists).toBe(false);
  });

  it('refuses to delete an open walk', async () => {
    const { walkId } = await makeWalk('open');
    await expectQualkError(deleteWalk(db, OWNER, walkId), 'failed-precondition');
  });

  it('duplicates a walk as a fresh draft', async () => {
    const { walkId } = await makeWalk('ended', [stop(0, { skippedForAll: true }), stop(1)], {
      joinCode: 'K72QX',
      openFor: 'day',
    });
    const copy = await duplicateWalk(db, OWNER, walkId);
    const walk = (await db.doc(`walks/${copy.walkId}`).get()).data()!;
    expect(walk).toMatchObject({ status: 'draft', title: 'Harbour history', stopCount: 2 });
    expect(walk.joinCode).toBeUndefined();
    expect(walk.openFor).toBeUndefined();
    const stops = await db.collection(`walks/${copy.walkId}/stops`).get();
    expect(stops.docs.map((d) => d.data().skippedForAll)).toEqual([false, false]);
  });
});

describe('pushFinishNews', () => {
  it('marks a day walk once everyone who started has finished', async () => {
    const { walkId } = await makeWalk('open', undefined, { openFor: 'day' });
    const teams = db.collection(`walks/${walkId}/teams`);
    await teams
      .doc('a')
      .set({ name: 'A', startedAt: Timestamp.now(), finishedAt: Timestamp.now() });
    await teams.doc('b').set({ name: 'B', startedAt: Timestamp.now() });
    await teams.doc('c').set({ name: 'C' }); // joined, never started
    await pushFinishNews(db, walkId, 'a', false);
    expect((await db.doc(`walks/${walkId}`).get()).data()?.allFinishedNotifiedAt).toBeUndefined();
    await teams.doc('b').update({ leftAt: Timestamp.now() });
    await pushFinishNews(db, walkId, 'b', false);
    expect((await db.doc(`walks/${walkId}`).get()).data()?.allFinishedNotifiedAt).toBeInstanceOf(
      Timestamp,
    );
  });
});
