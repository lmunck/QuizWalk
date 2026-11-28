/**
 * Importing the Claude-written seed bank (decided 2026-11-28): reviewed JSON files in
 * content/question-bank/<category>/<subcategory>.json, run by scripts/import-question-bank.ts.
 * The files use their own category and subcategory ids, mapped here onto the live taxonomy in
 * shared/src/categories.ts. Idempotent: each file's ids are the document ids, and a re-import
 * updates the text but never the stats, `rand` or status.
 */
import {
  DIFFICULTIES,
  EMPTY_STATS,
  normaliseText,
  parsePoolKey,
  poolKey,
  repeatsExisting,
  writtenQuestionProblem,
  type BankQuestionDoc,
  type Difficulty,
  type PoolRef,
  type Rng,
  type TriviaCategoryId,
} from '@qualk/shared';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import { BANK } from './store';

/** File category id → live category id. */
export const IMPORT_CATEGORIES: Record<string, TriviaCategoryId> = {
  history: 'history',
  geography: 'geography',
  science: 'science',
  nature: 'nature',
  space: 'space',
  sport: 'sport',
  music: 'music',
  'film-tv': 'film',
  food: 'food',
  'art-books': 'art',
  words: 'words',
};

/** File subcategory id → live subcategory id, per file category. */
export const IMPORT_SUBCATEGORIES: Record<string, Record<string, string>> = {
  history: {
    'ancient-world': 'ancient',
    'middle-ages': 'medieval',
    'explorers-empires': 'exploration',
    'industrial-age': 'modern',
    'twentieth-century': 'twentieth',
    'nordic-history': 'nordic',
  },
  geography: {
    'countries-capitals': 'countries',
    'mountains-rivers': 'landforms',
    'oceans-islands': 'islands',
    'world-landmarks': 'cities',
    europe: 'europe',
    'flags-symbols': 'flags',
  },
  science: {
    'human-body': 'body',
    chemistry: 'chemistry',
    physics: 'physics',
    'earth-weather': 'weather',
    maths: 'maths',
    technology: 'inventions',
  },
  nature: {
    mammals: 'mammals',
    birds: 'birds',
    'sea-life': 'sea',
    insects: 'small',
    plants: 'plants',
    dinosaurs: 'dinosaurs',
  },
  space: {
    planets: 'solar',
    'sun-moon': 'moon',
    'stars-galaxies': 'stars',
    'space-missions': 'missions',
    astronauts: 'astronauts',
    'space-science': 'universe',
  },
  sport: {
    football: 'football',
    olympics: 'olympics',
    'racket-sports': 'racket',
    'cycling-running': 'endurance',
    'winter-sports': 'winter',
    'rules-equipment': 'rules',
  },
  music: {
    classical: 'classical',
    'pop-rock': 'pop',
    instruments: 'instruments',
    'film-stage': 'stage',
    'music-theory': 'theory',
    'world-music': 'world',
  },
  'film-tv': {
    animation: 'animated',
    'classic-films': 'classic',
    'childrens-tv': 'children',
    'film-making': 'making',
    characters: 'series',
    'fantasy-scifi': 'fantasy',
  },
  food: {
    'fruit-veg': 'produce',
    'world-dishes': 'dishes',
    'baking-sweets': 'sweets',
    'food-science': 'cooking',
    'food-origins': 'origins',
    drinks: 'drinks',
  },
  'art-books': {
    painting: 'painting',
    architecture: 'buildings',
    'childrens-books': 'childrens',
    'classic-novels': 'novels',
    myths: 'myths',
    'fairy-tales': 'myths',
  },
  words: {
    'word-origins': 'origins',
    languages: 'languages',
    idioms: 'idioms',
    'writing-systems': 'writing',
    'place-names': 'origins',
    synonyms: 'opposites',
  },
};

/** The files' own limits, stricter than the bank's. */
export const IMPORT_LIMITS = { question: 150, answer: 40, explanation: 220 } as const;

export interface ImportQuestion {
  id: string;
  difficulty: string;
  question: string;
  correct: string;
  wrong: string[];
  explanation: string;
  writtenBy: string;
  checkedBy: string;
}

export interface ImportFile {
  category: string;
  subcategory: string;
  questions: ImportQuestion[];
}

/** The live pool for a file and difficulty, or why there is none. */
export function mapPool(file: { category: string; subcategory: string }, difficulty: string) {
  const category = IMPORT_CATEGORIES[file.category];
  if (!category) return { problem: `unknown category ${file.category}` } as const;
  const subcategory = IMPORT_SUBCATEGORIES[file.category]?.[file.subcategory];
  if (!subcategory) return { problem: `unknown subcategory ${file.subcategory}` } as const;
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    return { problem: `unknown difficulty ${difficulty}` } as const;
  }
  const pool = parsePoolKey(`${category}.${subcategory}.${difficulty}`);
  return pool ? ({ pool } as const) : ({ problem: 'no such pool' } as const);
}

const ID = /^[A-Za-z0-9._-]{1,200}$/;
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** Why a file's question can't be imported, or undefined if it can. */
export function importProblem(q: Partial<ImportQuestion>): string | undefined {
  if (!isText(q.id) || !ID.test(q.id) || q.id === '.' || q.id === '..') return 'bad id';
  if (!isText(q.question) || !isText(q.correct) || !Array.isArray(q.wrong)) return 'missing field';
  if (!isText(q.writtenBy) || !isText(q.checkedBy)) return 'missing writtenBy or checkedBy';
  if (q.question.trim().length > IMPORT_LIMITS.question) return 'question too long';
  if ([q.correct, ...q.wrong].some((a) => String(a ?? '').trim().length > IMPORT_LIMITS.answer)) {
    return 'answer too long';
  }
  if ((q.explanation ?? '').trim().length > IMPORT_LIMITS.explanation)
    return 'explanation too long';
  return writtenQuestionProblem({
    question: q.question,
    correct: q.correct,
    wrong: q.wrong.map(String),
    explanation: q.explanation ?? '',
  });
}

export interface ImportReport {
  files: number;
  questions: number;
  inserted: number;
  updated: number;
  /** Skipped questions by reason, e.g. { duplicate: 3, 'answer too long': 1 }. */
  skipped: Record<string, number>;
  /** Up to 50 examples: "history/middle-ages.json history.middle-ages.kids.07: duplicate". */
  examples: string[];
  /** Questions per live pool in this import. */
  perPool: Record<string, number>;
}

interface Existing {
  id: string;
  question: string;
  correct: string;
  pool: string;
}

/**
 * Validates and writes the files. With `dryRun`, reads the bank to find duplicates but writes
 * nothing. A question is a duplicate when its text matches any bank question (after
 * normalising) or it repeats one in the same pool; a re-imported id is an update, not one.
 */
export async function importBank(
  db: Firestore,
  files: { path: string; data: ImportFile }[],
  opts: { dryRun: boolean; seedBatch: string; rng?: Rng; nowMs?: number },
): Promise<ImportReport> {
  const rng = opts.rng ?? Math.random;
  const report: ImportReport = {
    files: files.length,
    questions: 0,
    inserted: 0,
    updated: 0,
    skipped: {},
    examples: [],
    perPool: {},
  };
  const skip = (path: string, id: string, reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
    if (report.examples.length < 50) report.examples.push(`${path} ${id}: ${reason}`);
  };

  const snap = await db
    .collection(BANK)
    .select('question', 'correct', 'category', 'subcategory', 'difficulty')
    .get();
  const existing: Existing[] = snap.docs.map((d) => ({
    id: d.id,
    question: String(d.get('question') ?? ''),
    correct: String(d.get('correct') ?? ''),
    pool: `${d.get('category')}.${d.get('subcategory')}.${d.get('difficulty')}`,
  }));
  const ids = new Set(existing.map((e) => e.id));
  const texts = new Map(existing.map((e) => [normaliseText(e.question), e.id]));
  const byPool = new Map<string, Existing[]>();
  for (const e of existing) byPool.set(e.pool, [...(byPool.get(e.pool) ?? []), e]);

  const writes: { id: string; update: boolean; data: Record<string, unknown> }[] = [];
  for (const { path, data } of files) {
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    for (const q of questions) {
      report.questions++;
      const id = String(q?.id ?? '?');
      const problem = importProblem(q ?? {});
      if (problem) {
        skip(path, id, problem);
        continue;
      }
      const mapped = mapPool(data, q.difficulty);
      if ('problem' in mapped) {
        skip(path, id, mapped.problem as string);
        continue;
      }
      const pool: PoolRef = mapped.pool;
      const key = poolKey(pool);
      const text = normaliseText(q.question);
      const sameText = texts.get(text);
      const others = (byPool.get(key) ?? []).filter((e) => e.id !== id);
      if ((sameText && sameText !== id) || repeatsExisting(q, others)) {
        skip(path, id, 'duplicate');
        continue;
      }
      texts.set(text, id);
      byPool.set(key, [
        ...(byPool.get(key) ?? []),
        { id, question: q.question, correct: q.correct, pool: key },
      ]);
      report.perPool[key] = (report.perPool[key] ?? 0) + 1;

      const content = {
        kind: 'trivia',
        category: pool.category,
        subcategory: pool.subcategory,
        difficulty: pool.difficulty,
        question: q.question.trim(),
        correct: q.correct.trim(),
        wrong: q.wrong.map((w) => String(w).trim()),
        explanation: (q.explanation ?? '').trim(),
        model: q.writtenBy,
        checkModel: q.checkedBy,
        seedBatch: opts.seedBatch,
      };
      if (ids.has(id)) {
        writes.push({ id, update: true, data: content });
        report.updated++;
      } else {
        ids.add(id);
        const doc: Omit<BankQuestionDoc, 'createdAt'> & { createdAt: Timestamp } = {
          ...(content as Omit<BankQuestionDoc, 'status' | 'stats' | 'createdAt' | 'rand'>),
          status: 'active',
          stats: EMPTY_STATS,
          createdAt: Timestamp.fromMillis(opts.nowMs ?? Date.now()),
          rand: rng(),
        };
        writes.push({ id, update: false, data: doc });
        report.inserted++;
      }
    }
  }

  if (!opts.dryRun) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + 400)) {
        const ref = db.collection(BANK).doc(w.id);
        // An update leaves stats, rand, status and createdAt as they are.
        if (w.update) batch.update(ref, w.data);
        else batch.set(ref, w.data);
      }
      await batch.commit();
    }
  }
  return report;
}
