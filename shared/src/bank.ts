/**
 * The question bank (spec §6, §8 "Question bank" and "Reports and blocking";
 * m4-generation-design §5–§6). Types and the pure rules the functions and the fill script share.
 */
import {
  autoCategories,
  subcategoriesFor,
  type CategoryId,
  type PoolRef,
  type TriviaCategoryId,
} from './categories';
import type { Difficulty, TimestampLike, LatLng } from './types';

export type BankQuestionKind = 'trivia' | 'place';
/** `flagged` waits for review and is not picked; `blocked` is never picked again. */
export type BankQuestionStatus = 'active' | 'flagged' | 'blocked';
export type ReportReason = 'wrong' | 'offensive' | 'confusing';

export const REPORT_REASONS: readonly ReportReason[] = ['wrong', 'offensive', 'confusing'];

/** P4's *Report question* choices. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong: 'Wrong answer',
  offensive: 'Offensive',
  confusing: 'Confusing',
};

/** "Thanks. We'll check it." (spec §3 P4) */
export const REPORT_THANKS = "Thanks. We'll check it.";

/** Totals only, with no personal data, so they are kept when answers are deleted. */
export interface BankStats {
  /** Times the question was put into a walk. */
  used: number;
  answered: number;
  correct: number;
  /** Times a creator swapped it out, edited it or deleted its stop. */
  replaced: number;
  reports: number;
  reasons: Record<ReportReason, number>;
}

export const EMPTY_STATS: BankStats = {
  used: 0,
  answered: 0,
  correct: 0,
  replaced: 0,
  reports: 0,
  reasons: { wrong: 0, offensive: 0, confusing: 0 },
};

/** questionBank/{questionId}. Functions only. */
export interface BankQuestionDoc {
  kind: BankQuestionKind;
  category: CategoryId;
  subcategory: string;
  difficulty: Difficulty;
  /** 'wikidata:Q12345', place questions only. */
  placeKey?: string;
  question: string;
  correct: string;
  /** Exactly three. Shuffled in with the correct answer when the question is picked. */
  wrong: string[];
  explanation: string;
  source?: { title: string; url: string };
  status: BankQuestionStatus;
  stats: BankStats;
  /** The model that wrote it and the one that checked it. */
  model: string;
  checkModel: string;
  createdAt: TimestampLike;
  /** Set by the review script when a flagged question is kept. */
  reviewedAt?: TimestampLike;
  /** In [0, 1): random picks with a range query. */
  rand: number;
}

/** places/{placeKey}. Functions only; recorded even when no good question came out. */
export interface PlaceDoc {
  name: string;
  location: LatLng;
  generatedAt: TimestampLike;
  questionCount: number;
  source?: { title: string; url: string };
}

/** questionReports/{reportId}, created by the reporter (spec §7). */
export interface QuestionReportDoc {
  uid: string;
  reason: ReportReason;
  createdAt: TimestampLike;
  walkId: string;
  stopId: string;
  /** Set when the stop's question came from the bank. */
  questionId?: string;
}

/**
 * The report's document id: one report per person and question (spec §7). A bank question is
 * reported once across every walk it appears in; a creator's own question once per stop.
 */
export function questionReportId(
  target: { questionId?: string; walkId: string; stopId: string },
  uid: string,
): string {
  return target.questionId
    ? `bank_${target.questionId}_${uid}`
    : `stop_${target.walkId}_${target.stopId}_${uid}`;
}

// ------------------------------------------------------------------ status

/** One *offensive* report hides a question until it has been reviewed. */
export const FLAG_OFFENSIVE_REPORTS = 1;
/** A few *wrong answer* reports flag it. */
export const FLAG_WRONG_REPORTS = 3;
export const FLAG_CONFUSING_REPORTS = 5;
/** An unusual share of correct answers: below 10% once 10 teams have answered. */
export const FLAG_MIN_ANSWERED = 10;
export const FLAG_MAX_CORRECT_SHARE = 0.1;
/** Creators replacing it: at least 5 times and in at least half the walks it was put in. */
export const FLAG_MIN_REPLACED = 5;
export const FLAG_REPLACED_SHARE = 0.5;

/**
 * The status after a change to the counts (spec §8 "Reports and blocking"). `blocked` is
 * final, and only the review script moves a question from `flagged` back to `active`.
 * A question kept on review is flagged again only by new reports, not by its old counts.
 */
export function statusAfter(
  current: BankQuestionStatus,
  stats: BankStats,
  reviewed: boolean,
): BankQuestionStatus {
  if (current !== 'active') return current;
  const r = stats.reasons;
  if (r.offensive >= FLAG_OFFENSIVE_REPORTS) return 'flagged';
  if (r.wrong >= FLAG_WRONG_REPORTS) return 'flagged';
  if (r.confusing >= FLAG_CONFUSING_REPORTS) return 'flagged';
  if (reviewed) return 'active';
  if (
    stats.answered >= FLAG_MIN_ANSWERED &&
    stats.correct / stats.answered < FLAG_MAX_CORRECT_SHARE
  ) {
    return 'flagged';
  }
  if (stats.replaced >= FLAG_MIN_REPLACED && stats.replaced >= stats.used * FLAG_REPLACED_SHARE) {
    return 'flagged';
  }
  return 'active';
}

// ------------------------------------------------------------------ writing and checking

export interface WrittenQuestion {
  question: string;
  correct: string;
  wrong: string[];
  explanation: string;
  /** Place questions are written at a mix of difficulties. */
  difficulty?: Difficulty;
}

export const QUESTION_MAX_CHARS = 200;
export const ANSWER_MAX_CHARS = 80;
export const EXPLANATION_MAX_CHARS = 300;

/** Words that mark a fact that may not stay true (spec §8: no "current" facts). */
const TIME_BOUND =
  /\b(current(ly)?|nowadays|as of|this year|last year|latest|most recent|recently|today'?s?|reigning|incumbent|so far|to date|still holds?)\b/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** A question's text with case, accents and punctuation removed, for spotting repeats. */
export function normaliseText(s: string): string {
  return norm(s);
}

/** Why a written question can't go into the bank, or undefined if it can. */
export function writtenQuestionProblem(q: WrittenQuestion): string | undefined {
  const question = q.question?.trim() ?? '';
  const correct = q.correct?.trim() ?? '';
  const wrong = Array.isArray(q.wrong) ? q.wrong.map((w) => String(w ?? '').trim()) : [];
  if (question.length < 10) return 'question too short';
  if (question.length > QUESTION_MAX_CHARS) return 'question too long';
  if (!question.endsWith('?')) return 'not a question';
  if (TIME_BOUND.test(question) || TIME_BOUND.test(correct)) return 'time-bound fact';
  if (correct.length === 0 || correct.length > ANSWER_MAX_CHARS) return 'bad correct answer';
  if (wrong.length !== 3) return 'needs three wrong answers';
  if (wrong.some((w) => w.length === 0 || w.length > ANSWER_MAX_CHARS)) return 'bad wrong answer';
  const all = [correct, ...wrong].map(norm);
  if (new Set(all).size !== 4) return 'repeated answer';
  if (/\b(all|none|both) of the (above|these)\b/i.test([correct, ...wrong].join(' '))) {
    return 'all/none of the above';
  }
  if ((q.explanation?.trim().length ?? 0) > EXPLANATION_MAX_CHARS) return 'explanation too long';
  return undefined;
}

/** Trims every field of a question that passed `writtenQuestionProblem`. */
export function cleanWrittenQuestion(q: WrittenQuestion): WrittenQuestion {
  return {
    question: q.question.trim(),
    correct: q.correct.trim(),
    wrong: q.wrong.map((w) => w.trim()),
    explanation: (q.explanation ?? '').trim(),
    ...(q.difficulty ? { difficulty: q.difficulty } : {}),
  };
}

function wordSet(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(' ')
      .filter((w) => w.length > 2),
  );
}

/**
 * Whether a new question repeats one already in the pool: the same text, or the same correct
 * answer with mostly the same words.
 */
export function repeatsExisting(
  q: Pick<WrittenQuestion, 'question' | 'correct'>,
  existing: Pick<WrittenQuestion, 'question' | 'correct'>[],
): boolean {
  const text = norm(q.question);
  const answer = norm(q.correct);
  const words = wordSet(q.question);
  return existing.some((e) => {
    if (norm(e.question) === text) return true;
    if (norm(e.correct) !== answer) return false;
    const other = wordSet(e.question);
    const shared = [...words].filter((w) => other.has(w)).length;
    const union = new Set([...words, ...other]).size;
    return union > 0 && shared / union >= 0.5;
  });
}

// ------------------------------------------------------------------ picking

/** A random number source in [0, 1), so tests can fix it. */
export type Rng = () => number;

/** A small seeded generator (mulberry32), for repeatable picks in tests and variants. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The right answer and the wrong ones are stored apart and shuffled when picked, which also
 * removes the writer's habit of putting the right answer in the same slot.
 */
export function shuffleAnswers(
  correct: string,
  wrong: readonly string[],
  rng: Rng,
): { options: string[]; correctIndex: number } {
  const options = shuffled([correct, ...wrong], rng);
  return { options, correctIndex: options.indexOf(correct) };
}

/**
 * Which pools a walk's trivia questions come from: round-robin over the categories (Auto: the
 * ones that suit the difficulty), and within each category through its subcategories in a
 * random order, so a walk is spread over them before any repeats.
 */
export function planTriviaPools(
  categories: CategoryId[],
  difficulty: Difficulty,
  count: number,
  rng: Rng,
): PoolRef[] {
  const trivia = categories.filter((c): c is TriviaCategoryId => c !== 'local');
  const cats = shuffled(trivia.length > 0 ? trivia : autoCategories(difficulty), rng);
  const queues = new Map<TriviaCategoryId, string[]>();
  const nextSub = (c: TriviaCategoryId): string | undefined => {
    let q = queues.get(c);
    if (!q || q.length === 0) {
      q = shuffled(
        subcategoriesFor(c, difficulty).map((s) => s.id),
        rng,
      );
      queues.set(c, q);
    }
    return q.shift();
  };
  const pools: PoolRef[] = [];
  for (let i = 0; pools.length < count && i < count * 4; i++) {
    const category = cats[i % cats.length] as TriviaCategoryId;
    const subcategory = nextSub(category);
    if (subcategory) pools.push({ category, subcategory, difficulty });
  }
  return pools;
}

/** A pool is topped up when a creator has fewer unused questions than twice a walk's worth. */
export const TOP_UP_BELOW_UNUSED = 24;
/** Each writing call asks for this many; longer lists drift and repeat themselves. */
export const QUESTIONS_PER_CALL = 25;
/** The fill script fills each pool to this many active questions. */
export const FILL_TARGET_PER_POOL = 40;
/** About five per place, written on its first walk. */
export const QUESTIONS_PER_PLACE = 5;

/** The place key for a Wikidata item: 'wikidata:Q12345'. */
export function placeKeyFor(wikidataId: string): string {
  return `wikidata:${wikidataId}`;
}
