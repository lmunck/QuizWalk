/**
 * M4 functions against the Firestore emulator, with recorded OpenRouteService, Overpass,
 * Wikidata and Wikipedia answers and a fake writer. Run with `npm run test:functions`.
 */
import {
  allPools,
  decodePolyline,
  distanceM,
  poolKey,
  routeKey,
  seededRng,
  type BankQuestionDoc,
  type LatLng,
  type PoolRef,
} from '@qualk/shared';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fillBank } from './bank/fill';
import { insertQuestions, placeDoc, recordSpend, spentUsd, triviaDoc } from './bank/store';
import { requestTopUp, runTopUp, TOP_UPS_PER_DAY } from './bank/topup';
import { duplicateWalk, publishWalk } from './core';
import { generateWalk } from './generate';
import { fakeLlm } from './llm/fake';
import { checkRateLimit } from './rateLimit';
import { applyReport, countAnswer, countStopChange } from './reports';
import { reroute } from './routing/reroute';
import { RoutingError, type RoutedLine, type WalkingRouter } from './routing/router';
import type { Services } from './services';
import { swapQuestion } from './swap';
import { fixture, recordedOverpass, recordedWiki } from './testing';

let db: Firestore;
const OWNER = 'owner';
const models = { writer: 'gemini-3.8-flash', checker: 'gemini-4-argon' };
const loop = fixture<{ body: { routes: { geometry: string; summary: { distance: number } }[] } }>(
  'ors-loop',
).body.routes[0]!;
const route = {
  polyline: loop.geometry,
  distanceM: Math.round(loop.summary.distance),
  durationS: 2600,
};
const routePoints = decodePolyline(loop.geometry);

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

function services(over: Partial<Services> = {}): Services & { llm: ReturnType<typeof fakeLlm> } {
  return {
    db,
    llm: fakeLlm(),
    models,
    overpass: recordedOverpass(),
    wiki: recordedWiki(),
    rng: seededRng(7),
    now: () => Date.now(),
    ...over,
  } as Services & { llm: ReturnType<typeof fakeLlm> };
}

/** `perPool` numbered questions in each pool given. */
async function seedBank(pools: PoolRef[], perPool: number) {
  const rng = seededRng(99);
  const docs = pools.flatMap((pool) =>
    Array.from({ length: perPool }, (_, i) =>
      triviaDoc(
        pool,
        {
          question: `${poolKey(pool)} question ${i}?`,
          correct: `${poolKey(pool)} right ${i}`,
          wrong: [`w${i}a`, `w${i}b`, `w${i}c`],
          explanation: 'Because.',
        },
        { models, rand: rng },
      ),
    ),
  );
  for (let i = 0; i < docs.length; i += 400) await insertQuestions(db, docs.slice(i, i + 400));
}

const pools = (category: string, difficulty = 'mixed') =>
  allPools().filter((p) => p.category === category && p.difficulty === difficulty);
const mixedPools = () => allPools().filter((p) => p.difficulty === 'mixed');

async function makeWalk(extra: Record<string, unknown> = {}) {
  const ref = db.collection('walks').doc();
  await ref.set({
    ownerUid: OWNER,
    ownerName: 'Anders',
    title: 'New walk',
    status: 'draft',
    modes: { solo: true, team: true },
    maxPlayers: 6,
    start: new GeoPoint(routePoints[0]!.latitude, routePoints[0]!.longitude),
    startLabel: '',
    shape: 'loop',
    route,
    stopCount: 0,
    distanceM: 0,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...extra,
  });
  return ref;
}

// Stop documents as the tests read them; any keeps the assertions short.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StopRow = Record<string, any>;

async function stopsOf(walkId: string) {
  const snap = await db.collection(`walks/${walkId}/stops`).orderBy('order').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StopRow);
}

async function bankDoc(id: string) {
  return (await db.doc(`questionBank/${id}`).get()).data() as BankQuestionDoc;
}

// ------------------------------------------------------------------ generateWalk

describe('generateWalk', () => {
  it('names the stops, picks History questions over its subcategories and titles the walk', async () => {
    await seedBank(pools('history'), 5);
    const walk = await makeWalk({ categories: ['history'], difficulty: 'mixed' });
    const res = await generateWalk(services(), OWNER, { walkId: walk.id, questionCount: 8 });

    expect(res).toMatchObject({ jobId: walk.id, stopCount: 8, localCount: 0 });
    expect(res.title).toMatch(/^History walk from \S/);
    const stops = await stopsOf(walk.id);
    expect(stops).toHaveLength(8);
    expect(stops.map((s) => s.placeName)).toContain('Taarnet på Kongens Nytorv');
    const subs = new Set<string>();
    for (const s of stops) {
      const q = await bankDoc(s.bankQuestionId);
      expect(q.category).toBe('history');
      expect(s.options[s.correctIndex]).toBe(q.correct);
      expect([...s.options].sort()).toEqual([q.correct, ...q.wrong].sort());
      expect(q.stats.used).toBe(1);
      expect(s).toMatchObject({ origin: 'ai', radiusM: 40, warnings: [], skippedForAll: false });
      subs.add(q.subcategory);
    }
    expect(subs.size).toBe(6);
    // The last stop is back at the start.
    expect(distanceM(stops[7]!.location, routePoints[0]!)).toBeLessThan(80);

    const w = (await walk.get()).data()!;
    expect(w).toMatchObject({
      title: res.title,
      stopCount: 8,
      distanceM: route.distanceM,
      shape: 'loop',
      categories: ['history'],
      difficulty: 'mixed',
    });
    const pins = stops.map((s) => ({
      latitude: s.location.latitude,
      longitude: s.location.longitude,
    }));
    expect(w.route.key).toBe(
      routeKey({ latitude: w.start.latitude, longitude: w.start.longitude }, pins),
    );

    const job = (await db.doc(`generationJobs/${walk.id}`).get()).data()!;
    expect(job).toMatchObject({ ownerUid: OWNER, walkId: walk.id, status: 'done', step: 2 });
    expect(job.steps).toEqual(['naming', 'picking']);
    expect(job.stepDetail).toHaveLength(2);
    expect(job.latestQuestion).toBeUndefined();

    // publishWalk takes the routed distance, because the route matches the pins.
    await publishWalk(db, OWNER, walk.id);
    expect((await walk.get()).data()!.distanceM).toBe(route.distanceM);
  });

  it('leaves out questions the creator has used before', async () => {
    await seedBank(pools('history'), 3);
    const a = await makeWalk({ categories: ['history'] });
    const b = await makeWalk({ categories: ['history'] });
    await generateWalk(services(), OWNER, { walkId: a.id, questionCount: 8 });
    await generateWalk(services({ rng: seededRng(8) }), OWNER, { walkId: b.id, questionCount: 8 });
    const ids = (await stopsOf(a.id)).map((s) => s.bankQuestionId);
    const again = (await stopsOf(b.id)).map((s) => s.bankQuestionId);
    expect(ids.filter((id) => again.includes(id))).toEqual([]);
  });

  it('writes Local questions for new places, records the places, and reuses them next time', async () => {
    await seedBank(mixedPools(), 2);
    const svc = services();
    const walk = await makeWalk({ categories: ['local'] });
    const res = await generateWalk(svc, OWNER, { walkId: walk.id, questionCount: 8 });

    const job = (await db.doc(`generationJobs/${walk.id}`).get()).data()!;
    expect(job.steps).toEqual(['naming', 'picking', 'writing']);
    expect(job.step).toBe(3);
    expect(res.localCount).toBeGreaterThanOrEqual(2);
    expect(res.localCount).toBeLessThanOrEqual(4);
    expect(res.title).toMatch(/^Local walk from /);

    const stops = await stopsOf(walk.id);
    const local = stops.filter((s) => s.warnings.includes('unverified'));
    expect(local).toHaveLength(res.localCount);
    for (const s of local) {
      const q = await bankDoc(s.bankQuestionId);
      expect(q.kind).toBe('place');
      expect(s.source.url).toMatch(/^https:\/\/(en|da)\.wikipedia\.org\/wiki\//);
      expect(s.placeName).toBeTruthy();
    }
    // Every other stop got trivia, so nothing blocks publishing.
    expect(stops.every((s) => s.question && s.bankQuestionId)).toBe(true);

    const places = await db.collection('places').get();
    expect(places.size).toBeGreaterThanOrEqual(res.localCount);
    expect(places.docs.some((p) => p.get('questionCount') > 0)).toBe(true);
    const spend = await db.doc('bankMeta/spend').get();
    expect(spend.get('place.calls')).toBeGreaterThan(0);

    // A second walk on the same route uses the stored questions: places that already have
    // questions are not written again (only those the first walk's limit of 4 left out are).
    const ready = places.docs.filter((p) => p.get('questionCount') > 0).map((p) => p.get('name'));
    const writerCalls = svc.llm.calls.length;
    const again = await makeWalk({ categories: ['local'] });
    const res2 = await generateWalk(svc, OWNER, { walkId: again.id, questionCount: 8 });
    expect(res2.localCount).toBeGreaterThan(0);
    const reused = (await stopsOf(again.id)).filter((s) => s.warnings.includes('unverified'));
    const firstIds = local.map((s) => s.bankQuestionId);
    expect(reused.every((s) => !firstIds.includes(s.bankQuestionId))).toBe(true);
    const newPrompts = svc.llm.calls.slice(writerCalls).map((c) => c.prompt);
    for (const name of ready) {
      expect(newPrompts.some((p) => p.includes(`about the place "${name}"`))).toBe(false);
    }
  });

  it('under Auto uses Local at up to half the stops, and trivia everywhere else', async () => {
    await seedBank(mixedPools(), 2);
    const walk = await makeWalk({ categories: [] });
    const res = await generateWalk(services(), OWNER, { walkId: walk.id, questionCount: 8 });
    expect(res.localCount).toBeLessThanOrEqual(4);
    expect(res.title).toMatch(/^Quiz walk from /);
    const stops = await stopsOf(walk.id);
    const cats = new Set<string>();
    for (const s of stops) cats.add((await bankDoc(s.bankQuestionId)).category);
    expect(cats.size).toBeGreaterThan(3);
  });

  it('on New route keeps trivia and own questions in order and drops Local ones', async () => {
    await seedBank(pools('history'), 4);
    const walk = await makeWalk({ categories: ['history'], title: 'My title' });
    const trivia = (await db.collection('questionBank').limit(1).get()).docs[0]!;
    const [place] = [
      placeDoc(
        'wikidata:Q1',
        { question: 'Old place question?', correct: 'a', wrong: ['b', 'c', 'd'], explanation: '' },
        { title: 'T', url: 'https://en.wikipedia.org/wiki/T' },
        { models, rand: Math.random },
      ),
    ];
    await insertQuestions(db, [place!]);
    const base = {
      radiusM: 40,
      explanation: '',
      warnings: [],
      skippedForAll: false,
      location: new GeoPoint(55.68, 12.59),
    };
    await walk
      .collection('stops')
      .doc('a')
      .set({
        ...base,
        order: 0,
        placeName: 'x',
        question: 'Own question?',
        options: ['Yes', 'No'],
        correctIndex: 1,
        origin: 'manual',
        hint: 'Look up',
      });
    await walk
      .collection('stops')
      .doc('b')
      .set({
        ...base,
        order: 1,
        placeName: 'y',
        question: 'Place?',
        options: ['a', 'b'],
        correctIndex: 0,
        origin: 'ai',
        bankQuestionId: place!.id,
        warnings: ['unverified'],
      });
    await walk
      .collection('stops')
      .doc('c')
      .set({
        ...base,
        order: 2,
        placeName: 'z',
        question: trivia.get('question'),
        options: ['r', 's'],
        correctIndex: 0,
        origin: 'ai',
        bankQuestionId: trivia.id,
      });

    await generateWalk(services(), OWNER, { walkId: walk.id, questionCount: 6 });
    const stops = await stopsOf(walk.id);
    expect(stops).toHaveLength(6);
    expect(stops.map((s) => s.question)).not.toContain('Place?');
    const own = stops.findIndex((s) => s.question === 'Own question?');
    const kept = stops.findIndex((s) => s.bankQuestionId === trivia.id);
    expect(own).toBe(0);
    expect(kept).toBe(1);
    expect(stops[0]).toMatchObject({ origin: 'manual', hint: 'Look up', correctIndex: 1 });
    expect((await walk.get()).data()!.title).toBe('My title');
    // Kept questions aren't counted as used again.
    expect((await bankDoc(trivia.id)).stats.used).toBe(0);
  });

  it('still makes the walk when Overpass is down, with unnamed stops', async () => {
    await seedBank(pools('space'), 2);
    const walk = await makeWalk({ categories: ['space'] });
    const down = { query: async () => Promise.reject(new Error('502')) };
    const res = await generateWalk(services({ overpass: down }), OWNER, {
      walkId: walk.id,
      questionCount: 4,
    });
    expect(res.stopCount).toBe(4);
    expect((await stopsOf(walk.id)).every((s) => s.placeName === '' && s.question)).toBe(true);
  });

  it('fails clearly, and says so in the job, when the bank has nothing', async () => {
    const walk = await makeWalk({ categories: ['music'] });
    const err = await generateWalk(services(), OWNER, { walkId: walk.id, questionCount: 4 }).catch(
      (e) => e,
    );
    expect(err).toMatchObject({ code: 'failed-precondition', details: { reason: 'noQuestions' } });
    const job = (await db.doc(`generationJobs/${walk.id}`).get()).data()!;
    expect(job).toMatchObject({ status: 'failed', error: err.message });
  });

  it('refuses a walk with no route, one that is open, one already generating, or not yours', async () => {
    const noRoute = await makeWalk({ route: null });
    await expect(
      generateWalk(services(), OWNER, { walkId: noRoute.id, questionCount: 4 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const open = await makeWalk({ status: 'open' });
    await expect(
      generateWalk(services(), OWNER, { walkId: open.id, questionCount: 4 }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const busy = await makeWalk();
    await db
      .doc(`generationJobs/${busy.id}`)
      .set({ status: 'running', updatedAt: Timestamp.now() });
    await expect(
      generateWalk(services(), OWNER, { walkId: busy.id, questionCount: 4 }),
    ).rejects.toThrow('already being generated');
    await expect(
      generateWalk(services(), 'stranger', { walkId: busy.id, questionCount: 4 }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      generateWalk(services(), OWNER, { walkId: busy.id, questionCount: 20 }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});

// ------------------------------------------------------------------ swapQuestion

describe('swapQuestion', () => {
  it('proposes another trivia question and writes nothing', async () => {
    await seedBank(pools('history'), 4);
    const walk = await makeWalk({ categories: ['history'] });
    await generateWalk(services(), OWNER, { walkId: walk.id, questionCount: 4 });
    const [stop] = await stopsOf(walk.id);
    const res = await swapQuestion(services(), OWNER, { walkId: walk.id, stopId: stop!.id });
    const p = res.proposal!;
    const inWalk = (await stopsOf(walk.id)).map((s) => s.bankQuestionId);
    expect(inWalk).not.toContain(p.bankQuestionId);
    expect(p).toMatchObject({ kind: 'trivia', category: 'history', origin: 'ai', warnings: [] });
    expect(p.options).toHaveLength(4);
    expect(p.options[p.correctIndex]).toBe((await bankDoc(p.bankQuestionId)).correct);
    expect((await stopsOf(walk.id))[0]).toEqual(stop);

    // What was offered in this sheet isn't offered again.
    const next = await swapQuestion(services({ rng: seededRng(3) }), OWNER, {
      walkId: walk.id,
      stopId: stop!.id,
      exclude: [p.bankQuestionId],
    });
    expect(next.proposal!.bankQuestionId).not.toBe(p.bankQuestionId);
  });

  it('offers another question about the same place for a Local stop', async () => {
    const key = 'wikidata:Q1589941';
    const source = { title: 'Kongens Nytorv', url: 'https://en.wikipedia.org/wiki/Kongens_Nytorv' };
    const docs = [0, 1, 2].map((i) =>
      placeDoc(
        key,
        {
          question: `Square fact ${i}?`,
          correct: `a${i}`,
          wrong: ['b', 'c', 'd'],
          explanation: '',
        },
        source,
        { models, rand: Math.random },
      ),
    );
    await insertQuestions(db, docs);
    const walk = await makeWalk();
    await walk
      .collection('stops')
      .doc('s')
      .set({
        order: 0,
        location: new GeoPoint(55.68, 12.585),
        placeName: 'Kongens Nytorv',
        radiusM: 40,
        question: docs[0]!.question,
        options: ['a0', 'b'],
        correctIndex: 0,
        explanation: '',
        origin: 'ai',
        bankQuestionId: docs[0]!.id,
        warnings: ['unverified'],
        skippedForAll: false,
      });
    const res = await swapQuestion(services(), OWNER, { walkId: walk.id, stopId: 's' });
    expect(res.proposal).toMatchObject({ kind: 'place', warnings: ['unverified'], source });
    expect([docs[1]!.id, docs[2]!.id]).toContain(res.proposal!.bankQuestionId);
  });

  it('suggests a Local question for a new stop next to a documented place (G2)', async () => {
    await seedBank(mixedPools(), 1);
    const walk = await makeWalk();
    // Next to Kongens Nytorv, which has a Wikipedia article in the recorded answers.
    const res = await swapQuestion(services(), OWNER, {
      walkId: walk.id,
      location: { latitude: 55.6805, longitude: 12.5862 },
    });
    expect(res.proposal).toMatchObject({ kind: 'place', warnings: ['unverified'] });
    expect(res.proposal!.placeName).toBeTruthy();
    expect((await db.collection('places').get()).size).toBe(1);
  });

  it('refuses once the walk is open, and a stop that is gone', async () => {
    const open = await makeWalk({ status: 'open' });
    await expect(
      swapQuestion(services(), OWNER, { walkId: open.id, stopId: 'x' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    const draft = await makeWalk();
    await expect(
      swapQuestion(services(), OWNER, { walkId: draft.id, stopId: 'gone' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

// ------------------------------------------------------------------ reroute

/** A router that returns the pins themselves as the route, snapping some of them away. */
function pinRouter(opts: { offM?: Record<number, number>; unroutable?: number } = {}) {
  let calls = 0;
  const router: WalkingRouter = {
    async route(waypoints: LatLng[]): Promise<RoutedLine> {
      calls++;
      if (opts.unroutable !== undefined && calls === 1) {
        throw new RoutingError('unroutable', 'no path', opts.unroutable);
      }
      const points = waypoints.map((p, i) => ({
        latitude: p.latitude + (opts.offM?.[i] ?? 0) / 111_195,
        longitude: p.longitude,
      }));
      return {
        points,
        polyline: 'abc',
        distanceM: 1234,
        durationS: 900,
        wayPoints: points.map((_, i) => i),
      };
    },
  };
  return router;
}

async function walkWithPins(n: number) {
  const walk = await makeWalk({ route: null, shape: 'oneway' });
  for (let i = 0; i < n; i++) {
    await walk
      .collection('stops')
      .doc(`s${i}`)
      .set({
        order: i,
        location: new GeoPoint(55.68 + i * 0.002, 12.59),
        placeName: '',
        radiusM: 40,
        question: 'Q?',
        options: ['a', 'b'],
        correctIndex: 0,
        explanation: '',
        origin: 'manual',
        warnings: i === 0 ? ['unverified'] : [],
        skippedForAll: false,
      });
  }
  return walk;
}

describe('reroute', () => {
  it('writes the route and its distance, and marks stops a team on the path might miss', async () => {
    const walk = await walkWithPins(3);
    const res = await reroute(
      db,
      pinRouter({ offM: { 2: 50 } }),
      recordedOverpass(),
      OWNER,
      walk.id,
    );
    expect(res.distanceM).toBe(1234);
    expect(res.stops.map((s) => s.offsetM)).toEqual([0, 50, 0]);
    // The recorded water answer puts the first off-path pin on water.
    expect(res.stops.map((s) => s.warnings)).toEqual([['unverified'], ['onWater'], []]);
    const w = (await walk.get()).data()!;
    expect(w.distanceM).toBe(1234);
    expect(w.route.key).toBeTruthy();
    expect((await stopsOf(walk.id))[1]!.warnings).toEqual(['onWater']);

    // publishWalk keeps the routed distance while the pins match, straight lines once one moves.
    await publishWalk(db, OWNER, walk.id);
    expect((await walk.get()).data()!.distanceM).toBe(1234);
    await walk
      .collection('stops')
      .doc('s2')
      .update({ location: new GeoPoint(55.7, 12.59) });
    await publishWalk(db, OWNER, walk.id);
    expect((await walk.get()).data()!.distanceM).not.toBe(1234);
  });

  it('leaves out a stop with no path near it, marks it, and keeps the walk on straight lines', async () => {
    const walk = await walkWithPins(3);
    const res = await reroute(db, pinRouter({ unroutable: 2 }), recordedOverpass(), OWNER, walk.id);
    expect(res.stops[1]).toMatchObject({ offsetM: null });
    expect(res.stops[1]!.warnings).toHaveLength(1);
    expect(res.route!.key).toBeUndefined();
  });

  it('clears the route of a walk with no stops, and refuses an open walk', async () => {
    const empty = await walkWithPins(0);
    expect(await reroute(db, pinRouter(), recordedOverpass(), OWNER, empty.id)).toEqual({
      route: null,
      distanceM: 0,
      stops: [],
    });
    const open = await makeWalk({ status: 'open' });
    await expect(
      reroute(db, pinRouter(), recordedOverpass(), OWNER, open.id),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

// ------------------------------------------------------------------ reports and counts

async function oneQuestion(pool: PoolRef = pools('history')[0]!) {
  await seedBank([pool], 1);
  return (await db.collection('questionBank').limit(1).get()).docs[0]!.id;
}

describe('reports and the bank counts', () => {
  it('hides a question after one offensive report and asks for a top-up', async () => {
    const id = await oneQuestion();
    const pool = await applyReport(db, { questionId: id, reason: 'offensive' });
    expect(pool).toMatchObject({ category: 'history' });
    const q = await bankDoc(id);
    expect(q.status).toBe('flagged');
    expect(q.stats).toMatchObject({ reports: 1, reasons: { offensive: 1, wrong: 0 } });
  });

  it('flags after three wrong-answer reports', async () => {
    const id = await oneQuestion();
    await applyReport(db, { questionId: id, reason: 'wrong' });
    await applyReport(db, { questionId: id, reason: 'wrong' });
    expect((await bankDoc(id)).status).toBe('active');
    await applyReport(db, { questionId: id, reason: 'wrong' });
    expect((await bankDoc(id)).status).toBe('flagged');
  });

  it('only logs a report on a creator-written question, and ignores a bad reason', async () => {
    expect(await applyReport(db, { walkId: 'w', stopId: 's', reason: 'wrong' })).toBeUndefined();
    const id = await oneQuestion();
    await applyReport(db, { questionId: id, reason: 'boring' });
    expect((await bankDoc(id)).stats.reports).toBe(0);
  });

  it('counts an answer once, and skips do not count', async () => {
    const id = await oneQuestion();
    const walk = await makeWalk({ status: 'open' });
    await walk.collection('stops').doc('s').set({ bankQuestionId: id, correctIndex: 2 });
    const answer = walk.collection('teams').doc('t').collection('answers').doc('s');
    await answer.set({ kind: 'answered', choiceIndex: 2 });
    await countAnswer(db, walk.id, 't', 's');
    await countAnswer(db, walk.id, 't', 's');
    expect((await bankDoc(id)).stats).toMatchObject({ answered: 1, correct: 1 });
    expect((await answer.get()).get('bankCounted')).toBe(true);

    const skip = walk.collection('teams').doc('u').collection('answers').doc('s');
    await skip.set({ kind: 'skipped' });
    await countAnswer(db, walk.id, 'u', 's');
    expect((await bankDoc(id)).stats.answered).toBe(1);
  });

  it('flags a question almost nobody gets right', async () => {
    const id = await oneQuestion();
    await db.doc(`questionBank/${id}`).update({ 'stats.answered': 9, 'stats.correct': 0 });
    const walk = await makeWalk({ status: 'open' });
    await walk.collection('stops').doc('s').set({ bankQuestionId: id, correctIndex: 0 });
    await walk.collection('teams/t/answers').doc('s').set({ kind: 'answered', choiceIndex: 1 });
    const hidden = await countAnswer(db, walk.id, 't', 's');
    expect((await bankDoc(id)).status).toBe('flagged');
    expect(hidden).toMatchObject({ category: 'history' });
  });

  it('counts a creator swapping a question in and out', async () => {
    await seedBank([pools('history')[0]!], 2);
    const [a, b] = (await db.collection('questionBank').get()).docs.map((d) => d.id);
    await countStopChange(db, { bankQuestionId: a }, { bankQuestionId: b });
    expect((await bankDoc(a!)).stats.replaced).toBe(1);
    expect((await bankDoc(b!)).stats.used).toBe(1);
    await countStopChange(db, { bankQuestionId: b }, undefined);
    expect((await bankDoc(b!)).stats.replaced).toBe(1);
    expect(await countStopChange(db, { bankQuestionId: a }, { bankQuestionId: a })).toEqual([]);
  });
});

// ------------------------------------------------------------------ top-ups, limits, the fill

describe('topping up', () => {
  const pool = pools('space')[0]!;

  it('queues one top-up per pool at a time, with a cooldown and a daily cap', async () => {
    const t = Date.parse('2026-11-27T10:00:00Z');
    expect(await requestTopUp(db, pool, t)).toBe(true);
    expect(await requestTopUp(db, pool, t + 1000)).toBe(false);
    // A queued top-up that never ran is taken over after 15 minutes.
    expect(await requestTopUp(db, pool, t + 16 * 60_000)).toBe(true);

    for (const p of allPools().slice(0, TOP_UPS_PER_DAY + 2)) await requestTopUp(db, p, t + 2e6);
    const queued = await db.collection('bankTopUps').where('status', '==', 'queued').get();
    expect(queued.size).toBeLessThanOrEqual(TOP_UPS_PER_DAY + 1);
  });

  it('adds checked questions to the pool, once, and records the spend', async () => {
    await seedBank([pool], 2);
    await requestTopUp(db, pool);
    const llm = fakeLlm();
    const res = await runTopUp(db, llm, models, poolKey(pool));
    expect(res!.added).toBe(20);
    expect(llm.calls[0]!.prompt).toContain(`${poolKey(pool)} right 0`);
    expect(await runTopUp(db, llm, models, poolKey(pool))).toBeUndefined();
    const doc = (await db.doc(`bankTopUps/${poolKey(pool)}`).get()).data()!;
    expect(doc).toMatchObject({ status: 'done', added: 20, dropped: 5 });
    expect(await spentUsd(db, 'topUp')).toBeGreaterThan(0);
    expect(await requestTopUp(db, pool)).toBe(false);
  });

  it('records a failed top-up', async () => {
    await requestTopUp(db, pool);
    await expect(
      runTopUp(db, fakeLlm({ failWriter: true }), models, poolKey(pool)),
    ).rejects.toThrow();
    expect((await db.doc(`bankTopUps/${poolKey(pool)}`).get()).get('status')).toBe('failed');
  });
});

describe('rate limits', () => {
  it('allows 30 Refreshes an hour and then says when to try again', async () => {
    const t = Date.parse('2026-11-27T10:00:00Z');
    for (let i = 0; i < 30; i++) await checkRateLimit(db, OWNER, 'routeForView', t + i * 1000);
    const err = await checkRateLimit(db, OWNER, 'routeForView', t + 31_000).catch((e) => e);
    expect(err).toMatchObject({ code: 'resource-exhausted', details: { reason: 'rateLimited' } });
    expect(err.details.retryAfterS).toBe(3600 - 31);
    // Other callables and other creators have their own counts.
    await checkRateLimit(db, OWNER, 'generateWalk', t);
    await checkRateLimit(db, 'someone', 'routeForView', t);
    // An hour later the first ones have left the window.
    await checkRateLimit(db, OWNER, 'routeForView', t + 3601_000);
  });
});

describe('fillBank', () => {
  const two = pools('sport').slice(0, 2);
  const quiet = { concurrency: 2, rpm: 6000, log: () => {}, sleep: async () => {} };

  it('fills each pool to the target, and a second run adds nothing', async () => {
    const first = await fillBank(db, fakeLlm(), models, {
      ...quiet,
      pools: two,
      target: 30,
      capUsd: 10,
    });
    expect(first.short).toEqual([]);
    expect(first.added).toBeGreaterThanOrEqual(60);
    const second = await fillBank(db, fakeLlm(), models, {
      ...quiet,
      pools: two,
      target: 30,
      capUsd: 10,
    });
    expect(second.batches).toBe(0);
    expect(second.spentUsd).toBeCloseTo(first.spentUsd, 6);
  });

  it('stops at the spending cap, counting what earlier runs spent', async () => {
    await recordSpend(db, 'fill', [
      { model: 'gemini-3.8-flash', inputTokens: 0, outputTokens: 2_660_000, thinkingTokens: 0 },
    ]);
    const report = await fillBank(db, fakeLlm(), models, {
      ...quiet,
      pools: two,
      target: 40,
      capUsd: 10,
    });
    expect(report.stoppedByCap).toBe(true);
    expect(report.batches).toBe(0);
    expect(report.spentUsd).toBeLessThanOrEqual(10);
  });
});

describe('duplicateWalk (M4)', () => {
  it('copies the categories, not the old topic', async () => {
    const walk = await makeWalk({ categories: ['space', 'local'], topic: 'Vikings' });
    const { walkId } = await duplicateWalk(db, OWNER, walk.id);
    const copy = (await db.doc(`walks/${walkId}`).get()).data()!;
    expect(copy.categories).toEqual(['space', 'local']);
    expect(copy.topic).toBeUndefined();
  });
});
