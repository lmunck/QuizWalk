/**
 * Reports and the bank's counts (spec §8 "Reports and blocking"). Every change to a bank
 * question's counts goes through `statusAfter`, so a question is hidden the moment it should be.
 */
import {
  EMPTY_STATS,
  REPORT_REASONS,
  statusAfter,
  type BankQuestionDoc,
  type BankStats,
  type PoolRef,
  type ReportReason,
  type TriviaCategoryId,
} from '@qualk/shared';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { BANK } from './bank/store';

type StatsChange = (s: BankStats) => void;

/** The pool a trivia question belongs to, for a top-up after it is hidden. */
function poolOf(q: BankQuestionDoc): PoolRef | undefined {
  if (q.kind !== 'trivia') return undefined;
  return {
    category: q.category as TriviaCategoryId,
    subcategory: q.subcategory,
    difficulty: q.difficulty,
  };
}

/**
 * Applies a change to a question's counts and its status, inside the caller's transaction.
 * Firestore wants every read before any write, so the question is read first (`readQuestion`)
 * and changed afterwards. Returns the pool when the question has just been hidden.
 */
function applyChange(
  tx: Transaction,
  snap: DocumentSnapshot,
  change: StatsChange,
): { hidden?: PoolRef } | undefined {
  if (!snap.exists) return undefined;
  const q = snap.data() as BankQuestionDoc;
  const stats: BankStats = {
    ...EMPTY_STATS,
    ...q.stats,
    reasons: { ...EMPTY_STATS.reasons, ...q.stats?.reasons },
  };
  change(stats);
  const status = statusAfter(q.status ?? 'active', stats, q.reviewedAt !== undefined);
  tx.update(snap.ref, { stats, status });
  return status !== 'active' && q.status === 'active' ? { hidden: poolOf(q) } : {};
}

const readQuestion = (db: Firestore, tx: Transaction, id: string) =>
  tx.get(db.collection(BANK).doc(id));

/** onQuestionReported: one report on a bank question. Creator-written ones are only logged. */
export async function applyReport(
  db: Firestore,
  report: { questionId?: unknown; reason?: unknown; walkId?: unknown; stopId?: unknown },
): Promise<PoolRef | undefined> {
  const reason = REPORT_REASONS.includes(report.reason as ReportReason)
    ? (report.reason as ReportReason)
    : undefined;
  if (!reason) return undefined;
  if (typeof report.questionId !== 'string' || !report.questionId) {
    logger.info('Report on a creator-written question', {
      walkId: report.walkId,
      stopId: report.stopId,
      reason,
    });
    return undefined;
  }
  const questionId = report.questionId;
  const res = await db.runTransaction(async (tx) =>
    applyChange(tx, await readQuestion(db, tx, questionId), (s) => {
      s.reports++;
      s.reasons[reason]++;
    }),
  );
  return res?.hidden;
}

/**
 * onAnswerCreated: counts an answer towards its stop's bank question once (the answer is
 * marked `bankCounted`), so a retried trigger doesn't count it twice.
 */
export async function countAnswer(
  db: Firestore,
  walkId: string,
  teamUid: string,
  stopId: string,
): Promise<PoolRef | undefined> {
  const stopRef = db.doc(`walks/${walkId}/stops/${stopId}`);
  const answerRef = db.doc(`walks/${walkId}/teams/${teamUid}/answers/${stopId}`);
  return db.runTransaction(async (tx) => {
    const [stop, answer] = await Promise.all([tx.get(stopRef), tx.get(answerRef)]);
    const questionId = stop.get('bankQuestionId');
    const a = answer.data();
    if (typeof questionId !== 'string' || !a || a.bankCounted === true) return undefined;
    if (a.kind === 'skipped' || typeof a.choiceIndex !== 'number') return undefined;
    const correct = a.choiceIndex === stop.get('correctIndex');
    const res = applyChange(tx, await readQuestion(db, tx, questionId), (s) => {
      s.answered++;
      if (correct) s.correct++;
    });
    tx.update(answerRef, { bankCounted: true });
    return res?.hidden;
  });
}

/**
 * onStopWritten, for writes by the creator's app only: a bank question swapped in counts as
 * used; one swapped out, edited away or deleted with its stop counts as replaced.
 */
export async function countStopChange(
  db: Firestore,
  before: { bankQuestionId?: unknown } | undefined,
  after: { bankQuestionId?: unknown } | undefined,
): Promise<PoolRef[]> {
  const was = typeof before?.bankQuestionId === 'string' ? before.bankQuestionId : undefined;
  const now = typeof after?.bankQuestionId === 'string' ? after.bankQuestionId : undefined;
  if (was === now) return [];
  const hidden: PoolRef[] = [];
  await db.runTransaction(async (tx) => {
    hidden.length = 0;
    const [wasSnap, nowSnap] = await Promise.all([
      was ? readQuestion(db, tx, was) : undefined,
      now ? readQuestion(db, tx, now) : undefined,
    ]);
    const results = [
      wasSnap && applyChange(tx, wasSnap, (s) => s.replaced++),
      nowSnap && applyChange(tx, nowSnap, (s) => s.used++),
    ];
    for (const r of results) if (r?.hidden) hidden.push(r.hidden);
  });
  return hidden;
}
