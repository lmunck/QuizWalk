/**
 * Local questions (spec §8 Next, step 2): stored per Wikidata place and written on the
 * place's first walk, about five, only from its Wikipedia text, then fact-checked. A place
 * is recorded even when nothing good came out of it, so it isn't tried again on every walk.
 */
import { placeKeyFor, QUESTIONS_PER_PLACE } from '@qualk/shared';
import { GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { insertQuestions, placeDoc, PLACES, recordSpend } from '../bank/store';
import { writePlace } from '../bank/write';
import type { LlmUsage } from '../llm/llm';
import type { Services } from '../services';
import type { OsmFeature } from './overpass';
import { MIN_PLACE_TEXT, placeTexts } from './wiki';

export type PlaceState =
  /** Has stored questions. */
  | 'ready'
  /** Tried before, or just now, and nothing good came out. */
  | 'none'
  /** New, and not written now (no writer, over the limit, or a failure). */
  | 'unknown';

/** The state of each place, by place key, without writing anything. */
export async function placeStates(
  svc: Services,
  places: OsmFeature[],
): Promise<Map<string, PlaceState>> {
  const keys = [...new Set(places.map((p) => placeKeyFor(p.wikidata as string)))];
  const out = new Map<string, PlaceState>();
  if (keys.length === 0) return out;
  const snaps = await svc.db.getAll(...keys.map((k) => svc.db.collection(PLACES).doc(k)));
  snaps.forEach((s, i) => {
    const key = keys[i] as string;
    if (!s.exists) out.set(key, 'unknown');
    else out.set(key, Number(s.get('questionCount') ?? 0) > 0 ? 'ready' : 'none');
  });
  return out;
}

/**
 * Writes questions for new places, in parallel. Returns each place's new state and how many
 * places got questions.
 */
export async function writeNewPlaces(
  svc: Services,
  places: OsmFeature[],
): Promise<{ states: Map<string, PlaceState>; written: number }> {
  const states = new Map<string, PlaceState>();
  if (places.length === 0 || !svc.llm) return { states, written: 0 };
  const llm = svc.llm;
  let texts;
  try {
    texts = await placeTexts(
      svc.wiki,
      places.map((p) => ({ wikidata: p.wikidata as string, wikipedia: p.wikipedia })),
    );
  } catch (err) {
    logger.warn('Wikipedia failed', { err: String(err) });
    return { states, written: 0 };
  }

  const usage: LlmUsage[] = [];
  let written = 0;
  await Promise.all(
    places.map(async (p) => {
      const key = placeKeyFor(p.wikidata as string);
      const text = texts.get(p.wikidata as string);
      const record = (questionCount: number, source?: { title: string; url: string }) =>
        svc.db
          .collection(PLACES)
          .doc(key)
          .set({
            name: p.name,
            location: new GeoPoint(p.location.latitude, p.location.longitude),
            generatedAt: Timestamp.fromMillis(svc.now()),
            questionCount,
            ...(source ? { source } : {}),
          });
      if (!text || text.text.length < MIN_PLACE_TEXT) {
        await record(0);
        states.set(key, 'none');
        return;
      }
      try {
        const res = await writePlace(
          llm,
          svc.models,
          { name: p.name, ...text },
          QUESTIONS_PER_PLACE,
        );
        usage.push(...res.usage);
        const source = { title: text.title, url: text.url };
        const docs = res.kept.map((q) =>
          placeDoc(key, q, source, { models: svc.models, rand: svc.rng, nowMs: svc.now() }),
        );
        await insertQuestions(svc.db, docs);
        await record(docs.length, source);
        states.set(key, docs.length > 0 ? 'ready' : 'none');
        if (docs.length > 0) written++;
      } catch (err) {
        // Not recorded, so a later walk tries again.
        logger.warn('Writing place questions failed', { place: key, err: String(err) });
        states.set(key, 'unknown');
      }
    }),
  );
  await recordSpend(svc.db, 'place', usage, svc.now());
  return { states, written };
}
