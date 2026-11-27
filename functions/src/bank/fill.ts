/**
 * Filling the bank ahead of time (spec §8 "Question bank"), run by scripts/fill-bank.ts.
 * Breadth first: every pool gets a batch before any pool gets a second, so a run stopped by
 * the spending cap leaves no category empty. Resumable and idempotent: the work is worked out
 * from what is in the bank, question ids are deterministic, and the spend so far is kept in
 * bankMeta/spend, so a second run carries on where the first stopped.
 */
import { poolKey, QUESTIONS_PER_CALL, type PoolRef } from '@qualk/shared';
import type { Firestore } from 'firebase-admin/firestore';

import type { Llm, LlmUsage, Models } from '../llm/llm';
import {
  countActive,
  insertQuestions,
  poolQuestions,
  recordSpend,
  spentUsd,
  triviaDoc,
} from './store';
import { writeTrivia } from './write';

export interface FillOptions {
  pools: PoolRef[];
  /** Active questions wanted per pool. */
  target: number;
  /** Stop before the fill's estimated spend, across all runs, passes this (USD). */
  capUsd: number;
  concurrency: number;
  /** Calls per minute to the model API, across workers (each batch is two calls). */
  rpm: number;
  log: (entry: FillLogEntry) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface FillLogEntry {
  pool: string;
  round: number;
  added: number;
  dropped: number;
  dropReasons: Record<string, number>;
  usage: LlmUsage[];
  costUsd: number;
  spentUsd: number;
  error?: string;
}

export interface FillReport {
  batches: number;
  added: number;
  dropped: number;
  spentUsd: number;
  stoppedByCap: boolean;
  /** Pools still below the target. */
  short: string[];
}

/** First guess at a batch's cost, until a real one is measured. */
const FIRST_ESTIMATE_USD = 0.04;
/** A pool whose batches keep adding almost nothing is left alone for the rest of the run. */
const EXHAUSTED_AFTER = 2;

export async function fillBank(
  db: Firestore,
  llm: Llm,
  models: Models,
  opts: FillOptions,
): Promise<FillReport> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let spent = await spentUsd(db, 'fill');
  let estimate = FIRST_ESTIMATE_USD;
  let inFlight = 0;
  let stoppedByCap = false;
  let nextCallAt = 0;
  const gapMs = 60_000 / Math.max(1, opts.rpm / 2);
  const poorBatches = new Map<string, number>();
  const report: FillReport = {
    batches: 0,
    added: 0,
    dropped: 0,
    spentUsd: spent,
    stoppedByCap: false,
    short: [],
  };

  const maxRounds = Math.ceil(opts.target / 10) + 2;
  for (let round = 1; round <= maxRounds && !stoppedByCap; round++) {
    const counts = await Promise.all(opts.pools.map((p) => countActive(db, p)));
    const todo = opts.pools.filter(
      (p, i) =>
        (counts[i] as number) < opts.target && (poorBatches.get(poolKey(p)) ?? 0) < EXHAUSTED_AFTER,
    );
    if (todo.length === 0) break;

    const queue = [...todo];
    const worker = async () => {
      for (;;) {
        const pool = queue.shift();
        if (!pool || stoppedByCap) return;
        if (spent + (inFlight + 1) * estimate > opts.capUsd) {
          stoppedByCap = true;
          return;
        }
        const wait = nextCallAt - now();
        nextCallAt = Math.max(now(), nextCallAt) + gapMs;
        if (wait > 0) await sleep(wait);
        inFlight++;
        const key = poolKey(pool);
        try {
          const existing = await poolQuestions(db, pool);
          const active = existing.filter((q) => q.status === 'active').length;
          const ask = Math.min(QUESTIONS_PER_CALL, Math.max(10, opts.target - active + 5));
          const res = await writeTrivia(llm, models, pool, ask, existing);
          const added = await insertQuestions(
            db,
            res.kept.map((q) => triviaDoc(pool, q, { models, rand: Math.random, nowMs: now() })),
          );
          const cost = await recordSpend(db, 'fill', res.usage, now());
          spent += cost;
          estimate = Math.max(estimate * 0.5 + cost * 0.5, cost);
          if (added < 3) poorBatches.set(key, (poorBatches.get(key) ?? 0) + 1);
          report.batches++;
          report.added += added;
          report.dropped += res.dropped.length;
          const dropReasons: Record<string, number> = {};
          for (const d of res.dropped) {
            const r = d.reason.startsWith('check:') ? 'check' : d.reason;
            dropReasons[r] = (dropReasons[r] ?? 0) + 1;
          }
          opts.log({
            pool: key,
            round,
            added,
            dropped: res.dropped.length,
            dropReasons,
            usage: res.usage,
            costUsd: cost,
            spentUsd: spent,
          });
        } catch (err) {
          poorBatches.set(key, (poorBatches.get(key) ?? 0) + 1);
          opts.log({
            pool: key,
            round,
            added: 0,
            dropped: 0,
            dropReasons: {},
            usage: [],
            costUsd: 0,
            spentUsd: spent,
            error: String(err).slice(0, 300),
          });
        } finally {
          inFlight--;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  }

  const finalCounts = await Promise.all(opts.pools.map((p) => countActive(db, p)));
  report.short = opts.pools.filter((_, i) => (finalCounts[i] as number) < opts.target).map(poolKey);
  report.spentUsd = spent;
  report.stoppedByCap = stoppedByCap;
  return report;
}
