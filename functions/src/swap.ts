/**
 * swapQuestion: C5's *Swap* and G2's *Suggest a question* (spec §3 C5, G2; §8). Proposes
 * another question for one stop, which the creator accepts or discards; nothing is written
 * here. A Local stop gets another question about its place while there are any; a stop next
 * to a documented place gets a Local question; everything else gets trivia from the bank.
 */
import {
  DIFFICULTIES,
  distanceM,
  TOP_UP_BELOW_UNUSED,
  normaliseCategories,
  placeKeyFor,
  shuffled,
  subcategoriesFor,
  type BankQuestionDoc,
  type CategoryId,
  type Difficulty,
  type LatLng,
  type PoolRef,
  type SwapQuestionResponse,
  type TriviaCategoryId,
} from '@qualk/shared';
import { logger } from 'firebase-functions';

import {
  BANK,
  PLACES,
  pickFromPool,
  placeQuestionsFor,
  toProposal,
  usedByCreator,
  type Avoid,
  type BankQuestion,
} from './bank/store';
import { ownedWalk } from './core';
import { QualkError } from './errors';
import { pickTrivia, requestTopUps } from './generate';
import { writeNewPlaces } from './places/local';
import { PLACE_MAX_DISTANCE_M } from './places/naming';
import { surroundings, type OsmFeature } from './places/overpass';
import { surroundingsFromWikipedia } from './places/wiki';
import type { Services } from './services';

function isLatLng(v: unknown): v is LatLng {
  const p = v as LatLng;
  return typeof p?.latitude === 'number' && typeof p?.longitude === 'number';
}

export function parseSwap(data: unknown) {
  const req = (data ?? {}) as Record<string, unknown>;
  if (typeof req.walkId !== 'string' || !req.walkId || req.walkId.includes('/')) {
    throw new QualkError('invalid-argument', 'No walk given.');
  }
  const stopId =
    typeof req.stopId === 'string' && req.stopId && !req.stopId.includes('/')
      ? req.stopId
      : undefined;
  const location = isLatLng(req.location) ? req.location : undefined;
  if (!stopId && !location) throw new QualkError('invalid-argument', 'No stop given.');
  const exclude = Array.isArray(req.exclude)
    ? req.exclude.filter((x): x is string => typeof x === 'string').slice(0, 100)
    : [];
  return { walkId: req.walkId, stopId, location, exclude };
}

/** The nearest documented place to a point, from one small Overpass query. */
async function placeNear(svc: Services, p: LatLng): Promise<OsmFeature | undefined> {
  try {
    const env = await surroundings(svc.overpass, [p]).catch(() =>
      surroundingsFromWikipedia(svc.wiki, [p]),
    );
    return env.features
      .filter((f) => f.wikidata && f.notable)
      .map((f) => ({ f, d: distanceM(f.location, p) }))
      .filter(({ d }) => d <= PLACE_MAX_DISTANCE_M)
      .sort((a, b) => b.f.score - a.f.score || a.d - b.d)[0]?.f;
  } catch (err) {
    logger.warn('Overpass failed', { err: String(err) });
    return undefined;
  }
}

/** Another question about a place, writing its questions first if no walk has used it. */
async function placeProposal(
  svc: Services,
  place: { key: string; name: string; feature?: OsmFeature },
  difficulty: Difficulty,
  exclude: Set<string>,
): Promise<BankQuestion | undefined> {
  const known = await svc.db.collection(PLACES).doc(place.key).get();
  if (!known.exists && place.feature) {
    await writeNewPlaces(svc, [place.feature]);
  }
  return (await placeQuestionsFor(svc.db, place.key, difficulty, exclude, svc.rng))[0];
}

export async function swapQuestion(
  svc: Services,
  uid: string,
  data: unknown,
): Promise<SwapQuestionResponse> {
  const req = parseSwap(data);
  const { db } = svc;
  const { ref: walkRef, walk } = await ownedWalk(db, uid, req.walkId);
  if (walk.status !== 'draft' && walk.status !== 'ready') {
    throw new QualkError('failed-precondition', 'Questions can’t change once the walk is open.');
  }

  const [stopsSnap, used] = await Promise.all([
    walkRef.collection('stops').get(),
    usedByCreator(db, uid),
  ]);
  const exclude = new Set([...used, ...req.exclude]);
  for (const s of stopsSnap.docs) {
    const id = s.get('bankQuestionId');
    if (typeof id === 'string') exclude.add(id);
  }
  const stop = req.stopId ? stopsSnap.docs.find((d) => d.id === req.stopId) : undefined;
  // The other stops' questions, so the proposal isn't about the same thing as one of them.
  const avoid: Avoid = stopsSnap.docs
    .filter((d) => d.id !== req.stopId && typeof d.get('question') === 'string')
    .map((d) => ({
      question: d.get('question') as string,
      correct: ((d.get('options') as string[] | undefined) ?? [])[d.get('correctIndex') ?? 0] ?? '',
    }));
  if (req.stopId && !stop) throw new QualkError('not-found', 'This stop no longer exists.');

  const currentId = stop?.get('bankQuestionId') as string | undefined;
  const current = currentId
    ? ((await db.collection(BANK).doc(currentId).get()).data() as BankQuestionDoc | undefined)
    : undefined;
  const difficulty: Difficulty = DIFFICULTIES.includes(walk.difficulty)
    ? walk.difficulty
    : (current?.difficulty ?? 'mixed');

  // A Local stop: another question about the same place.
  if (current?.kind === 'place' && current.placeKey) {
    const q = (await placeQuestionsFor(db, current.placeKey, difficulty, exclude, svc.rng))[0];
    if (q) return { proposal: toProposal(q, svc.rng, stop?.get('placeName') as string) };
  }

  // G2: a new stop next to a documented place gets a Local question.
  if (!stop && req.location) {
    const feature = await placeNear(svc, req.location);
    if (feature) {
      const q = await placeProposal(
        svc,
        { key: placeKeyFor(feature.wikidata as string), name: feature.name, feature },
        difficulty,
        exclude,
      );
      if (q) return { proposal: toProposal(q, svc.rng, feature.name) };
    }
  }

  // Trivia: another subcategory of the current question's category first, then the walk's.
  const pools: PoolRef[] = [];
  if (current?.kind === 'trivia') {
    const cat = current.category as TriviaCategoryId;
    const subs = shuffled(subcategoriesFor(cat, difficulty), svc.rng).sort(
      (a, b) => Number(a.id === current.subcategory) - Number(b.id === current.subcategory),
    );
    for (const s of subs) pools.push({ category: cat, subcategory: s.id, difficulty });
  }
  for (const pool of pools.slice(0, 3)) {
    const res = await pickFromPool(db, pool, 1, exclude, svc.rng, avoid);
    const q = res.picked[0];
    if (q) {
      if (res.unusedSeen - 1 < TOP_UP_BELOW_UNUSED) await requestTopUps(svc, [pool]);
      return { proposal: toProposal(q, svc.rng) };
    }
  }
  const categories: CategoryId[] = normaliseCategories(walk.categories);
  const trivia = await pickTrivia(svc, categories, difficulty, 1, exclude, avoid);
  await requestTopUps(svc, trivia.low);
  const q = trivia.picked[0];
  return { proposal: q ? toProposal(q, svc.rng) : null };
}
