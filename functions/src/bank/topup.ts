/**
 * Topping up the bank in the background (spec §8 `topUpQuestions`). A pick that sees fewer
 * than about twice a walk's worth of unused questions in a pool asks for a top-up by writing
 * bankTopUps/{poolKey}; the topUpQuestions trigger adds 20–25 questions. The document is also
 * the lock: at most one top-up per pool at a time, and a cooldown after each.
 */
import { poolKey, QUESTIONS_PER_CALL, type PoolRef } from '@qualk/shared';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import type { Llm, Models } from '../llm/llm';
import { insertQuestions, poolQuestions, recordSpend, triviaDoc } from './store';
import { writeTrivia } from './write';

export const TOP_UPS = 'bankTopUps';
const DAILY_DOC = 'bankMeta/topUps';

/** A queued or running top-up older than this is taken to have died. */
export const TOP_UP_STALE_MS = 15 * 60 * 1000;
/** After a top-up, the same pool waits this long before another. */
export const TOP_UP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** At most this many top-ups a day across the bank, so a bug can't run up a bill. */
export const TOP_UPS_PER_DAY = 20;

export type TopUpStatus = 'queued' | 'running' | 'done' | 'failed';

/** bankTopUps/{poolKey} */
export interface TopUpDoc {
  pool: PoolRef;
  status: TopUpStatus;
  requestedAt: Timestamp;
  updatedAt: Timestamp;
  added?: number;
  dropped?: number;
  costUsd?: number;
  error?: string;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Queues a top-up unless one is running, one finished recently, or today's cap is reached. */
export async function requestTopUp(db: Firestore, pool: PoolRef, nowMs = Date.now()) {
  const ref = db.collection(TOP_UPS).doc(poolKey(pool));
  const dailyRef = db.doc(DAILY_DOC);
  return db.runTransaction(async (tx) => {
    const [snap, daily] = await Promise.all([tx.get(ref), tx.get(dailyRef)]);
    const cur = snap.data() as TopUpDoc | undefined;
    if (cur) {
      const age = nowMs - cur.updatedAt.toMillis();
      if ((cur.status === 'queued' || cur.status === 'running') && age < TOP_UP_STALE_MS) {
        return false;
      }
      if (cur.status === 'done' && age < TOP_UP_COOLDOWN_MS) return false;
    }
    const today = day(nowMs);
    const count = daily.get('day') === today ? Number(daily.get('count') ?? 0) : 0;
    if (count >= TOP_UPS_PER_DAY) return false;
    const now = Timestamp.fromMillis(nowMs);
    tx.set(ref, { pool, status: 'queued', requestedAt: now, updatedAt: now });
    tx.set(dailyRef, { day: today, count: count + 1 });
    return true;
  });
}

/** Runs one queued top-up. Safe to call twice: only one call moves it from queued to running. */
export async function runTopUp(
  db: Firestore,
  llm: Llm,
  models: Models,
  key: string,
  nowMs = Date.now(),
): Promise<{ added: number } | undefined> {
  const ref = db.collection(TOP_UPS).doc(key);
  const pool = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as TopUpDoc | undefined;
    if (cur?.status !== 'queued') return undefined;
    tx.update(ref, { status: 'running', updatedAt: Timestamp.fromMillis(nowMs) });
    return cur.pool;
  });
  if (!pool) return undefined;

  try {
    const existing = await poolQuestions(db, pool);
    const res = await writeTrivia(llm, models, pool, QUESTIONS_PER_CALL, existing);
    const added = await insertQuestions(
      db,
      res.kept.map((q) => triviaDoc(pool, q, { models, rand: Math.random, nowMs })),
    );
    const cost = await recordSpend(db, 'topUp', res.usage);
    await ref.update({
      status: 'done',
      added,
      dropped: res.dropped.length,
      costUsd: cost,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { added };
  } catch (err) {
    await ref.update({
      status: 'failed',
      error: String(err).slice(0, 300),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err;
  }
}
