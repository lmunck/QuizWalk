/**
 * generateWalk: C2's Next (spec §8 "Generated walks", m4-generation-design §4). Names the
 * stops, picks questions from the bank, writes Local questions for places no walk has used,
 * titles the walk and writes its stops. Progress goes to generationJobs/{walkId} for C3.
 */
import {
  allPools,
  autoCategories,
  DEFAULT_STOP_RADIUS_M,
  decodePolyline,
  DIFFICULTIES,
  GENERATION_STALE_MS,
  generatedWalkTitle,
  normaliseCategories,
  placeKeyFor,
  planTriviaPools,
  plural,
  poolKey,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  routeKey,
  shuffled,
  spaceStops,
  TOP_UP_BELOW_UNUSED,
  type CategoryId,
  type Difficulty,
  type GenerateWalkResponse,
  type GenerationStep,
  type LatLng,
  type PoolRef,
  type ProposedQuestion,
  type StopWarning,
} from '@qualk/shared';
import {
  FieldValue,
  GeoPoint,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  BANK,
  pickFromPool,
  placeQuestionsFor,
  toProposal,
  usedByCreator,
  type Avoid,
  type BankQuestion,
} from './bank/store';
import { requestTopUp } from './bank/topup';
import { ownedWalk } from './core';
import { QualkError } from './errors';
import { writeNewPlaces, placeStates } from './places/local';
import { nameStops, streetNameAt, type NamedStop } from './places/naming';
import { surroundings, type OsmFeature, type OsmSurroundings } from './places/overpass';
import { surroundingsFromWikipedia } from './places/wiki';
import type { Services } from './services';

/** New places written per walk, so C3 stays a short wait. */
export const MAX_NEW_PLACES_PER_WALK = 4;
export const JOBS = 'generationJobs';

/** The question part of a stop, from the bank or kept from the walk's earlier stops. */
interface StopQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  hint?: string;
  source?: { title: string; url: string };
  origin: 'ai' | 'manual';
  bankQuestionId?: string;
  warnings: StopWarning[];
  /** Picked now, so the bank's `used` count goes up. */
  fresh: boolean;
  local: boolean;
}

function fromProposal(p: ProposedQuestion): StopQuestion {
  return {
    question: p.question,
    options: p.options,
    correctIndex: p.correctIndex,
    explanation: p.explanation,
    ...(p.source ? { source: p.source } : {}),
    origin: 'ai',
    bankQuestionId: p.bankQuestionId,
    warnings: p.warnings,
    fresh: true,
    local: p.kind === 'place',
  };
}

export function parseGenerateWalk(data: unknown): { walkId: string; questionCount: number } {
  const req = (data ?? {}) as { walkId?: unknown; questionCount?: unknown };
  if (typeof req.walkId !== 'string' || !req.walkId || req.walkId.includes('/')) {
    throw new QualkError('invalid-argument', 'No walk given.');
  }
  const n = req.questionCount;
  if (
    !Number.isInteger(n) ||
    (n as number) < QUESTION_COUNT_MIN ||
    (n as number) > QUESTION_COUNT_MAX
  ) {
    throw new QualkError(
      'invalid-argument',
      `Choose ${QUESTION_COUNT_MIN} to ${QUESTION_COUNT_MAX} questions.`,
    );
  }
  return { walkId: req.walkId, questionCount: n as number };
}

/** The questions of a walk's current stops worth keeping on New route: all but Local ones. */
async function keptQuestions(db: Firestore, walkRef: DocumentReference) {
  const snap = await walkRef.collection('stops').get();
  const stops = snap.docs.map((d) => d.data()).sort((a, b) => a.order - b.order);
  const ids = stops
    .map((s) => s.bankQuestionId)
    .filter((id): id is string => typeof id === 'string');
  const kinds = new Map<string, string>();
  if (ids.length > 0) {
    const bank = await db.getAll(...ids.map((id) => db.collection(BANK).doc(id)), {
      fieldMask: ['kind'],
    });
    bank.forEach((b) => kinds.set(b.id, String(b.get('kind') ?? 'trivia')));
  }
  const kept: StopQuestion[] = [];
  for (const s of stops) {
    if (typeof s.question !== 'string' || s.question.trim() === '') continue;
    if (s.bankQuestionId && kinds.get(s.bankQuestionId) === 'place') continue;
    kept.push({
      question: s.question,
      options: s.options ?? [],
      correctIndex: s.correctIndex ?? 0,
      explanation: s.explanation ?? '',
      ...(s.hint ? { hint: s.hint } : {}),
      ...(s.source ? { source: s.source } : {}),
      origin: s.origin === 'manual' ? 'manual' : 'ai',
      ...(s.bankQuestionId ? { bankQuestionId: s.bankQuestionId } : {}),
      warnings: (s.warnings ?? []).filter((w: string) => w === 'unverified'),
      fresh: false,
      local: false,
    });
  }
  return { kept, hadStops: snap.size > 0, oldIds: snap.docs.map((d) => d.ref) };
}

export interface TriviaPick {
  picked: BankQuestion[];
  /** Pools where the creator has fewer than TOP_UP_BELOW_UNUSED unused questions. */
  low: PoolRef[];
}

/**
 * `count` trivia questions spread over the categories' subcategories, leaving out `exclude`.
 * A pool that runs dry is made up from other pools of the same categories, then from Auto's.
 */
export async function pickTrivia(
  svc: Services,
  categories: CategoryId[],
  difficulty: Difficulty,
  count: number,
  exclude: Set<string>,
  avoid: Avoid = [],
): Promise<TriviaPick> {
  if (count <= 0) return { picked: [], low: [] };
  const plan = planTriviaPools(categories, difficulty, count, svc.rng);
  const want = new Map<string, { pool: PoolRef; n: number }>();
  for (const p of plan) {
    const k = poolKey(p);
    want.set(k, { pool: p, n: (want.get(k)?.n ?? 0) + 1 });
  }
  const picked: BankQuestion[] = [];
  const low: PoolRef[] = [];
  const seen = new Set<string>();
  const take = async (pool: PoolRef, n: number) => {
    seen.add(poolKey(pool));
    const res = await pickFromPool(svc.db, pool, n, exclude, svc.rng, avoid);
    res.picked.forEach((q) => exclude.add(q.id));
    picked.push(...res.picked);
    if (res.unusedSeen - res.picked.length < TOP_UP_BELOW_UNUSED) low.push(pool);
    return res.picked.length;
  };
  let short = 0;
  for (const { pool, n } of want.values()) short += n - (await take(pool, n));

  if (short > 0) {
    const trivia = categories.filter((c) => c !== 'local');
    const own = trivia.length > 0 ? trivia : autoCategories(difficulty);
    const spare = [
      ...shuffled(
        allPools().filter((p) => p.difficulty === difficulty && own.includes(p.category)),
        svc.rng,
      ),
      ...shuffled(
        allPools().filter(
          (p) => p.difficulty === difficulty && autoCategories(difficulty).includes(p.category),
        ),
        svc.rng,
      ),
    ].filter((p) => !seen.has(poolKey(p)));
    for (const pool of spare.slice(0, 16)) {
      if (short <= 0) break;
      if (seen.has(poolKey(pool))) continue;
      short -= await take(pool, short);
    }
  }
  // Spread the categories through the walk rather than in blocks.
  return { picked: shuffled(picked, svc.rng), low };
}

async function setJob(ref: DocumentReference, data: Record<string, unknown>): Promise<void> {
  await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

function startLabelFor(
  start: LatLng,
  named: NamedStop[],
  env: OsmSurroundings,
  fallback: string,
): string {
  const last = named[named.length - 1];
  if (last?.featureId) return last.placeName;
  return streetNameAt(start, env.streets) || fallback.trim();
}

export async function generateWalk(
  svc: Services,
  uid: string,
  data: unknown,
): Promise<GenerateWalkResponse> {
  const { walkId, questionCount: n } = parseGenerateWalk(data);
  const { db } = svc;
  const { ref: walkRef, walk } = await ownedWalk(db, uid, walkId);
  if (walk.status !== 'draft' && walk.status !== 'ready') {
    throw new QualkError('failed-precondition', 'Only a draft or a walk not yet open can change.');
  }
  const polyline = walk.route?.polyline;
  if (typeof polyline !== 'string' || polyline.length === 0) {
    throw new QualkError('failed-precondition', 'Refresh the map to make a route first.');
  }
  let points: LatLng[];
  try {
    points = decodePolyline(polyline);
  } catch {
    throw new QualkError('invalid-argument', 'The route is damaged. Refresh the map again.');
  }
  if (points.length < 2) {
    throw new QualkError('invalid-argument', 'The route is too short. Refresh the map again.');
  }

  const jobRef = db.collection(JOBS).doc(walkId);
  const job = await jobRef.get();
  if (
    job.get('status') === 'running' &&
    svc.now() - ((job.get('updatedAt') as Timestamp | undefined)?.toMillis() ?? 0) <
      GENERATION_STALE_MS
  ) {
    throw new QualkError('failed-precondition', 'This walk is already being generated.');
  }
  const steps: GenerationStep[] = ['naming', 'picking'];
  const stepDetail: string[] = [];
  await jobRef.set({
    ownerUid: uid,
    walkId,
    status: 'running',
    steps,
    step: 1,
    stepDetail,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  try {
    return await run();
  } catch (err) {
    const message =
      err instanceof QualkError ? err.message : 'Something went wrong while making the walk.';
    await setJob(jobRef, { status: 'failed', error: message });
    if (!(err instanceof QualkError))
      logger.error('generateWalk failed', { walkId, err: String(err) });
    throw err;
  }

  async function run(): Promise<GenerateWalkResponse> {
    // ---------------------------------------------------------------- 1. naming
    const planned = spaceStops(points, n);
    const start = points[0] as LatLng;
    let env: OsmSurroundings = { features: [], streets: [] };
    const around = [start, ...planned.map((s) => s.location)];
    try {
      env = await surroundings(svc.overpass, around);
    } catch (err) {
      // Wikipedia's GeoSearch still names stops after documented places and finds Local
      // ones; without either, stops keep their place on the route and go unnamed.
      logger.warn('Overpass failed', { walkId, err: String(err) });
      try {
        env = await surroundingsFromWikipedia(svc.wiki, around);
      } catch (err2) {
        logger.warn('Wikipedia GeoSearch failed', { walkId, err: String(err2) });
      }
    }
    const named = nameStops(points, planned, env.features, env.streets);
    const startLabel = startLabelFor(start, named, env, walk.startLabel ?? '');
    const namedCount = named.filter((s) => s.placeName).length;
    stepDetail.push(`${plural(n, 'stop')} along the route, ${namedCount} named`);
    await setJob(jobRef, { step: 2, stepDetail });

    // ---------------------------------------------------------------- 2. picking
    const categories = normaliseCategories(walk.categories);
    const difficulty: Difficulty = DIFFICULTIES.includes(walk.difficulty)
      ? walk.difficulty
      : 'mixed';
    const { kept, hadStops, oldIds } = await keptQuestions(db, walkRef);
    const exclude = await usedByCreator(db, uid);
    const questions: (StopQuestion | undefined)[] = new Array(n).fill(undefined);

    const auto = categories.length === 0;
    const localTarget = categories.includes('local')
      ? Math.ceil(n / categories.length)
      : auto
        ? Math.ceil(n / 2)
        : 0;
    const candidates = named
      .map((s, i) => ({ s, i }))
      .filter((c): c is { s: NamedStop & { place: OsmFeature }; i: number } => !!c.s.place)
      .sort((a, b) => b.s.place.score - a.s.place.score);
    const states =
      localTarget > 0
        ? await placeStates(
            svc,
            candidates.map((c) => c.s.place),
          )
        : new Map();
    const queued: { i: number; place: OsmFeature }[] = [];
    let localCount = 0;
    for (const c of candidates) {
      if (localCount + queued.length >= localTarget) break;
      const key = placeKeyFor(c.s.place.wikidata as string);
      const state = states.get(key);
      if (state === 'ready') {
        const qs = await placeQuestionsFor(db, key, difficulty, exclude, svc.rng);
        const q = qs[0];
        if (q) {
          exclude.add(q.id);
          questions[c.i] = fromProposal(toProposal(q, svc.rng, c.s.place.name));
          localCount++;
        }
      } else if (state === 'unknown' && svc.llm && queued.length < MAX_NEW_PLACES_PER_WALK) {
        queued.push({ i: c.i, place: c.s.place });
      }
    }

    // Trivia for every other stop: kept questions first, in their order, then fresh ones.
    const queuedSlots = new Set(queued.map((q) => q.i));
    const triviaSlots = questions
      .map((q, i) => (q === undefined && !queuedSlots.has(i) ? i : -1))
      .filter((i) => i >= 0);
    for (const q of kept) if (q.bankQuestionId) exclude.add(q.bankQuestionId);
    const keptQueue = [...kept];
    const needFresh = Math.max(0, triviaSlots.length - keptQueue.length) + queued.length;
    // Never two questions about the same thing in one walk.
    const avoid: Avoid = [
      ...kept.map((q) => ({ question: q.question, correct: q.options[q.correctIndex] ?? '' })),
      ...questions.flatMap((q) =>
        q ? [{ question: q.question, correct: q.options[q.correctIndex] ?? '' }] : [],
      ),
    ];
    const trivia = await pickTrivia(svc, categories, difficulty, needFresh, exclude, avoid);
    const freshQueue = trivia.picked.map((q) => fromProposal(toProposal(q, svc.rng)));
    for (const i of triviaSlots) questions[i] = keptQueue.shift() ?? freshQueue.shift();

    if (questions.every((q) => q === undefined) && queued.length === 0) {
      throw new QualkError(
        'failed-precondition',
        'There are no questions for this walk yet. Try other categories, or add stops by hand.',
        { reason: 'noQuestions' },
      );
    }
    const pickedCount = questions.filter(Boolean).length;
    stepDetail.push(`${plural(pickedCount, 'question')} picked`);

    // ---------------------------------------------------------------- 3. writing
    if (queued.length > 0) {
      steps.push('writing');
      await setJob(jobRef, { steps, step: 3, stepDetail });
      const { states: written } = await writeNewPlaces(
        svc,
        queued.map((q) => q.place),
      );
      let wroteFor = 0;
      for (const { i, place } of queued) {
        const key = placeKeyFor(place.wikidata as string);
        if (written.get(key) === 'ready') {
          const q = (await placeQuestionsFor(db, key, difficulty, exclude, svc.rng))[0];
          if (q) {
            exclude.add(q.id);
            questions[i] = fromProposal(toProposal(q, svc.rng, place.name));
            localCount++;
            wroteFor++;
            continue;
          }
        }
        questions[i] = freshQueue.shift();
      }
      stepDetail.push(`Wrote questions about ${plural(wroteFor, 'place')}`);
    } else {
      await setJob(jobRef, { stepDetail });
    }

    // ---------------------------------------------------------------- write the walk
    const batch = db.batch();
    for (const old of oldIds) batch.delete(old);
    const locations: LatLng[] = [];
    named.forEach((s, i) => {
      const q = questions[i];
      const place = q?.local ? s.place : undefined;
      locations.push(s.location);
      batch.set(walkRef.collection('stops').doc(), {
        order: i,
        location: new GeoPoint(s.location.latitude, s.location.longitude),
        placeName: (place?.name ?? s.placeName).slice(0, 80),
        radiusM: DEFAULT_STOP_RADIUS_M,
        question: q?.question ?? '',
        options: q?.options ?? ['', ''],
        correctIndex: q?.correctIndex ?? 0,
        explanation: q?.explanation ?? '',
        ...(q?.hint ? { hint: q.hint } : {}),
        ...(q?.source ? { source: q.source } : {}),
        origin: q?.origin ?? 'manual',
        ...(q?.bankQuestionId ? { bankQuestionId: q.bankQuestionId } : {}),
        warnings: q?.warnings ?? [],
        skippedForAll: false,
      });
      if (q?.fresh && q.bankQuestionId) {
        batch.update(db.collection(BANK).doc(q.bankQuestionId), {
          'stats.used': FieldValue.increment(1),
        });
      }
    });
    const title = hadStops ? walk.title : generatedWalkTitle(categories, startLabel);
    batch.update(walkRef, {
      title,
      categories,
      difficulty,
      shape: 'loop',
      start: new GeoPoint(start.latitude, start.longitude),
      startLabel: startLabel.slice(0, 80),
      route: { ...walk.route, key: routeKey(start, locations) },
      stopCount: n,
      distanceM: Math.round(walk.route.distanceM ?? 0),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    await setJob(jobRef, { status: 'done', step: steps.length, stepDetail });

    await requestTopUps(svc, trivia.low);
    return { jobId: walkId, title, stopCount: n, localCount };
  }
}

/** Asks for top-ups of pools running low. A failure here never fails the caller. */
export async function requestTopUps(svc: Services, pools: PoolRef[]): Promise<void> {
  const unique = [...new Map(pools.map((p) => [poolKey(p), p])).values()];
  await Promise.allSettled(
    unique.map((pool) =>
      requestTopUp(svc.db, pool, svc.now()).catch((err) =>
        logger.warn('Top-up request failed', { pool: poolKey(pool), err: String(err) }),
      ),
    ),
  );
}
