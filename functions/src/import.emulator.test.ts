/**
 * Importing the Claude-written seed bank against the Firestore emulator, from a small fixture
 * folder in the files' own format and taxonomy.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { importBank, mapPool, type ImportFile } from './bank/importBank';
import { insertQuestions, triviaDoc } from './bank/store';

let db: Firestore;
const dir = fileURLToPath(new URL('./fixtures/question-bank', import.meta.url));

function files(): { path: string; data: ImportFile }[] {
  const out: { path: string; data: ImportFile }[] = [];
  for (const cat of readdirSync(dir).sort()) {
    for (const name of readdirSync(join(dir, cat)).sort()) {
      const p = join(dir, cat, name);
      if (statSync(p).isFile())
        out.push({ path: `${cat}/${name}`, data: JSON.parse(readFileSync(p, 'utf8')) });
    }
  }
  return out;
}

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
  // A question the Gemini fill already wrote, which the files repeat.
  await insertQuestions(db, [
    triviaDoc(
      { category: 'history', subcategory: 'medieval', difficulty: 'mixed' },
      {
        question: 'Which English king was killed at the Battle of Hastings in 1066?',
        correct: 'Harold Godwinson',
        wrong: ['Edward the Confessor', 'William Rufus', 'Athelstan'],
        explanation: '',
      },
      {
        models: { writer: 'gemini-3.8-flash', checker: 'gemini-4-argon' },
        rand: Math.random,
        seedBatch: 'gemini-2026-11-27',
      },
    ),
  ]);
});

const opts = { dryRun: false, seedBatch: 'claude-2026-11-27' };

describe('importBank', () => {
  it('maps the files’ taxonomy onto the live pools', () => {
    expect(mapPool({ category: 'film-tv', subcategory: 'animation' }, 'kids')).toEqual({
      pool: { category: 'film', subcategory: 'animated', difficulty: 'kids' },
    });
    expect(mapPool({ category: 'history', subcategory: 'nordic-history' }, 'expert')).toEqual({
      pool: { category: 'history', subcategory: 'nordic', difficulty: 'expert' },
    });
    expect(mapPool({ category: 'history', subcategory: 'vikings' }, 'kids')).toEqual({
      problem: 'unknown subcategory vikings',
    });
    expect(mapPool({ category: 'history', subcategory: 'middle-ages' }, 'hard')).toEqual({
      problem: 'unknown difficulty hard',
    });
  });

  it('reports a dry run and writes nothing', async () => {
    const report = await importBank(db, files(), { ...opts, dryRun: true });
    expect(report).toMatchObject({ files: 3, questions: 9, inserted: 4, updated: 0 });
    expect(report.skipped).toEqual({
      duplicate: 2,
      'question too long': 1,
      'repeated answer': 1,
      'unknown subcategory vikings': 1,
    });
    expect(report.perPool).toEqual({
      'history.medieval.kids': 1,
      'history.medieval.mixed': 1,
      'history.medieval.expert': 1,
      'film.animated.kids': 1,
    });
    expect((await db.collection('questionBank').get()).size).toBe(1);
  });

  it('inserts under the files’ ids, then updates the text and keeps stats, rand and status', async () => {
    await importBank(db, files(), opts);
    const ref = db.doc('questionBank/history.middle-ages.kids.01');
    const first = (await ref.get()).data()!;
    expect(first).toMatchObject({
      kind: 'trivia',
      category: 'history',
      subcategory: 'medieval',
      difficulty: 'kids',
      status: 'active',
      correct: 'Longships',
      model: 'claude-sonnet-5-5',
      checkModel: 'claude-opus-5-5',
      seedBatch: 'claude-2026-11-27',
      stats: { used: 0, answered: 0 },
    });
    expect(first.rand).toBeGreaterThanOrEqual(0);
    expect(first.createdAt).toBeInstanceOf(Timestamp);

    await ref.update({ 'stats.used': 7, status: 'blocked' });
    const again = await importBank(db, files(), opts);
    expect(again).toMatchObject({ inserted: 0, updated: 4 });
    const after = (await ref.get()).data()!;
    expect(after.stats.used).toBe(7);
    expect(after.status).toBe('blocked');
    expect(after.rand).toBe(first.rand);
    expect((await db.collection('questionBank').get()).size).toBe(5);
  });
});
