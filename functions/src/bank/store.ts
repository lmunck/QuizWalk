/**
 * The bank in Firestore: questionBank/{id}, places/{placeKey} and the spend ledger
 * bankMeta/spend. Functions and scripts only; the rules let no client near these.
 */
import { createHash } from 'node:crypto';

import {
  DIFFICULTIES,
  EMPTY_STATS,
  poolKey,
  shuffleAnswers,
  similarQuestions,
  type BankQuestionDoc,
  type Difficulty,
  type PoolRef,
  type ProposedQuestion,
  type Rng,
  type WrittenQuestion,
} from '@qualk/shared';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import type { LlmUsage } from '../llm/llm';
import { costUsd } from '../llm/pricing';

export const BANK = 'questionBank';
export const PLACES = 'places';
export const SPEND_DOC = 'bankMeta/spend';

/** A bank question as read back, with its id. */
export type BankQuestion = BankQuestionDoc & { id: string };

/**
 * Deterministic ids, so writing the same question twice (a retried batch, a resumed fill)
 * can't make two documents.
 */
export function bankQuestionId(scope: string, question: string): string {
  const text = `${scope}|${question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()}`;
  return createHash('sha256').update(text).digest('base64url').slice(0, 20);
}

const toDifficulty = (d: unknown): Difficulty =>
  DIFFICULTIES.includes(d as Difficulty) ? (d as Difficulty) : 'mixed';

export interface NewQuestionMeta {
  models: { writer: string; checker: string };
  rand: Rng;
  nowMs?: number;
}

export function triviaDoc(
  pool: PoolRef,
  q: WrittenQuestion,
  meta: NewQuestionMeta,
): BankQuestionDoc & { id: string } {
  return {
    id: bankQuestionId(poolKey(pool), q.question),
    kind: 'trivia',
    category: pool.category,
    subcategory: pool.subcategory,
    difficulty: pool.difficulty,
    question: q.question,
    correct: q.correct,
    wrong: q.wrong,
    explanation: q.explanation,
    status: 'active',
    stats: EMPTY_STATS,
    model: meta.models.writer,
    checkModel: meta.models.checker,
    createdAt: Timestamp.fromMillis(meta.nowMs ?? Date.now()),
    rand: meta.rand(),
  };
}

export function placeDoc(
  placeKey: string,
  q: WrittenQuestion,
  source: { title: string; url: string },
  meta: NewQuestionMeta,
): BankQuestionDoc & { id: string } {
  return {
    id: bankQuestionId(placeKey, q.question),
    kind: 'place',
    category: 'local',
    subcategory: 'place',
    difficulty: toDifficulty(q.difficulty),
    placeKey,
    question: q.question,
    correct: q.correct,
    wrong: q.wrong,
    explanation: q.explanation,
    source,
    status: 'active',
    stats: EMPTY_STATS,
    model: meta.models.writer,
    checkModel: meta.models.checker,
    createdAt: Timestamp.fromMillis(meta.nowMs ?? Date.now()),
    rand: meta.rand(),
  };
}

/** Writes new questions, skipping any id that already exists. Returns how many were added. */
export async function insertQuestions(
  db: Firestore,
  docs: (BankQuestionDoc & { id: string })[],
): Promise<number> {
  if (docs.length === 0) return 0;
  const refs = docs.map((d) => db.collection(BANK).doc(d.id));
  const existing = await db.getAll(...refs, { fieldMask: ['status'] });
  const taken = new Set(existing.filter((s) => s.exists).map((s) => s.id));
  const batch = db.batch();
  let added = 0;
  docs.forEach((d, i) => {
    if (taken.has(d.id)) return;
    taken.add(d.id);
    const { id: _id, ...data } = d;
    void _id;
    batch.set(refs[i]!, data);
    added++;
  });
  if (added > 0) await batch.commit();
  return added;
}

const poolQuery = (db: Firestore, pool: PoolRef) =>
  db
    .collection(BANK)
    .where('category', '==', pool.category)
    .where('subcategory', '==', pool.subcategory)
    .where('difficulty', '==', pool.difficulty);

/** Every question in a pool (any status), for the writer's "don't repeat" list. */
export async function poolQuestions(
  db: Firestore,
  pool: PoolRef,
): Promise<{ question: string; correct: string; status: string }[]> {
  const snap = await poolQuery(db, pool).select('question', 'correct', 'status').get();
  return snap.docs.map((d) => ({
    question: String(d.get('question')),
    correct: String(d.get('correct')),
    status: String(d.get('status')),
  }));
}

export async function countActive(db: Firestore, pool: PoolRef): Promise<number> {
  const snap = await poolQuery(db, pool).where('status', '==', 'active').count().get();
  return snap.data().count;
}

/** How far into a pool a pick looks. Pools hold about 40, so this usually reads all of it. */
export const PICK_WINDOW = 60;

export interface PoolPick {
  picked: BankQuestion[];
  /** Active questions seen that the creator hasn't used. Exact for pools up to PICK_WINDOW. */
  unusedSeen: number;
}

/** The walk's questions so far, so a pick never repeats one of their facts. */
export type Avoid = Pick<WrittenQuestion, 'question' | 'correct'>[];

/**
 * Random picks from a pool: start at a random `rand`, read on and wrap round, leave out the
 * excluded ids (the creator's earlier questions and the walk's own), and take `n` at random,
 * skipping any about the same thing as a question in `avoid` (which the picks are added to).
 */
export async function pickFromPool(
  db: Firestore,
  pool: PoolRef,
  n: number,
  exclude: Set<string>,
  rng: Rng,
  avoid: Avoid = [],
): Promise<PoolPick> {
  const r = rng();
  const active = poolQuery(db, pool).where('status', '==', 'active').orderBy('rand');
  const after = await active.where('rand', '>=', r).limit(PICK_WINDOW).get();
  const docs = [...after.docs];
  if (docs.length < PICK_WINDOW) {
    const before = await active
      .where('rand', '<', r)
      .limit(PICK_WINDOW - docs.length)
      .get();
    docs.push(...before.docs);
  }
  const unused = docs
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ id: d.id, ...(d.data() as BankQuestionDoc) }));
  const picked: BankQuestion[] = [];
  const pool2 = [...unused];
  while (picked.length < n && pool2.length > 0) {
    const i = Math.floor(rng() * pool2.length);
    const q = pool2.splice(i, 1)[0] as BankQuestion;
    if (avoid.some((a) => similarQuestions(a, q))) continue;
    picked.push(q);
    avoid.push(q);
  }
  return { picked, unusedSeen: unused.length };
}

/** Active questions about a place, best difficulty first, then at random. */
export async function placeQuestionsFor(
  db: Firestore,
  placeKey: string,
  difficulty: Difficulty,
  exclude: Set<string>,
  rng: Rng,
): Promise<BankQuestion[]> {
  const snap = await db
    .collection(BANK)
    .where('placeKey', '==', placeKey)
    .where('status', '==', 'active')
    .get();
  const rank = (d: Difficulty) => (d === difficulty ? 0 : d === 'mixed' ? 1 : 2);
  return snap.docs
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ id: d.id, ...(d.data() as BankQuestionDoc), _r: rng() }))
    .sort((a, b) => rank(a.difficulty) - rank(b.difficulty) || a._r - b._r)
    .map(({ _r, ...q }) => {
      void _r;
      return q;
    });
}

/** The bank questions in all of a creator's walks: picks leave these out. */
export async function usedByCreator(db: Firestore, uid: string): Promise<Set<string>> {
  const walks = await db.collection('walks').where('ownerUid', '==', uid).select().get();
  const used = new Set<string>();
  await Promise.all(
    walks.docs.map(async (w) => {
      const stops = await w.ref.collection('stops').select('bankQuestionId').get();
      for (const s of stops.docs) {
        const id = s.get('bankQuestionId');
        if (typeof id === 'string') used.add(id);
      }
    }),
  );
  return used;
}

/** A bank question as C5 or G2 offers it, or as generateWalk writes it onto a stop. */
export function toProposal(q: BankQuestion, rng: Rng, placeName?: string): ProposedQuestion {
  const { options, correctIndex } = shuffleAnswers(q.correct, q.wrong, rng);
  return {
    bankQuestionId: q.id,
    kind: q.kind,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    options,
    correctIndex,
    explanation: q.explanation ?? '',
    ...(q.source ? { source: q.source } : {}),
    origin: 'ai',
    warnings: q.kind === 'place' ? ['unverified'] : [],
    ...(placeName ? { placeName } : {}),
  };
}

export type SpendSource = 'fill' | 'topUp' | 'place';

/** Adds a run's token use and estimated cost to bankMeta/spend, by source. */
export async function recordSpend(
  db: Firestore,
  source: SpendSource,
  usage: LlmUsage[],
  nowMs = Date.now(),
): Promise<number> {
  if (usage.length === 0) return 0;
  const cost = usage.reduce((s, u) => s + costUsd(u, nowMs), 0);
  const input = usage.reduce((s, u) => s + u.inputTokens, 0);
  const output = usage.reduce((s, u) => s + u.outputTokens + u.thinkingTokens, 0);
  await db.doc(SPEND_DOC).set(
    {
      [source]: {
        costUsd: FieldValue.increment(cost),
        inputTokens: FieldValue.increment(input),
        outputTokens: FieldValue.increment(output),
        calls: FieldValue.increment(usage.length),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return cost;
}

export async function spentUsd(db: Firestore, source: SpendSource): Promise<number> {
  const snap = await db.doc(SPEND_DOC).get();
  const v = snap.get(`${source}.costUsd`);
  return typeof v === 'number' ? v : 0;
}
