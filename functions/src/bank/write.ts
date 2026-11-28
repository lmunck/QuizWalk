/**
 * Writing questions and checking them (spec §8 "Question bank"): the writer model writes a
 * batch, simple rules drop malformed or time-bound ones and repeats, and a different, stronger
 * model checks the rest. A question that fails is dropped, not rewritten.
 */
import {
  cleanWrittenQuestion,
  repeatsExisting,
  writtenQuestionProblem,
  type PoolRef,
  type WrittenQuestion,
} from '@qualk/shared';

import type { Llm, LlmUsage, Models } from '../llm/llm';
import {
  CHECKER_SYSTEM,
  checkerSchema,
  placeCheckPrompt,
  placePrompt,
  triviaCheckPrompt,
  triviaPrompt,
  WRITER_SYSTEM,
  writerSchema,
} from './prompts';

export interface Dropped {
  question: string;
  reason: string;
}

export interface WriteResult {
  kept: WrittenQuestion[];
  dropped: Dropped[];
  usage: LlmUsage[];
}

interface Verdicts {
  verdicts?: { index?: number; pass?: boolean; reason?: string }[];
}

/** Drops malformed questions and repeats, of the pool and within the batch. */
export function screen(
  written: WrittenQuestion[],
  existing: Pick<WrittenQuestion, 'question' | 'correct'>[],
): { ok: WrittenQuestion[]; dropped: Dropped[] } {
  const ok: WrittenQuestion[] = [];
  const dropped: Dropped[] = [];
  for (const raw of written) {
    const problem = writtenQuestionProblem(raw);
    if (problem) {
      dropped.push({ question: String(raw?.question ?? ''), reason: problem });
      continue;
    }
    const q = cleanWrittenQuestion(raw);
    if (repeatsExisting(q, [...existing, ...ok])) {
      dropped.push({ question: q.question, reason: 'repeat' });
      continue;
    }
    ok.push(q);
  }
  return { ok, dropped };
}

/** Keeps only the questions with an explicit pass. */
export function applyVerdicts(questions: WrittenQuestion[], res: Verdicts) {
  const passed = new Set<number>();
  const reasons = new Map<number, string>();
  for (const v of res.verdicts ?? []) {
    if (typeof v.index !== 'number') continue;
    if (v.pass === true) passed.add(v.index);
    else reasons.set(v.index, v.reason ?? 'failed the check');
  }
  const kept: WrittenQuestion[] = [];
  const dropped: Dropped[] = [];
  questions.forEach((q, i) => {
    if (passed.has(i) && !reasons.has(i)) kept.push(q);
    else dropped.push({ question: q.question, reason: `check: ${reasons.get(i) ?? 'no verdict'}` });
  });
  return { kept, dropped };
}

async function writeAndCheck(
  llm: Llm,
  models: Models,
  write: { prompt: string; withDifficulty: boolean },
  check: (qs: WrittenQuestion[]) => string,
  existing: Pick<WrittenQuestion, 'question' | 'correct'>[],
): Promise<WriteResult> {
  const usage: LlmUsage[] = [];
  const written = await llm.json<{ questions?: WrittenQuestion[] }>({
    model: models.writer,
    system: WRITER_SYSTEM,
    prompt: write.prompt,
    schema: writerSchema(write.withDifficulty),
    thinking: 'low',
  });
  usage.push(written.usage);
  const screened = screen(written.data.questions ?? [], existing);
  if (screened.ok.length === 0) return { kept: [], dropped: screened.dropped, usage };

  const checked = await llm.json<Verdicts>({
    model: models.checker,
    system: CHECKER_SYSTEM,
    prompt: check(screened.ok),
    schema: checkerSchema,
    thinking: 'low',
  });
  usage.push(checked.usage);
  const verdicts = applyVerdicts(screened.ok, checked.data);
  return { kept: verdicts.kept, dropped: [...screened.dropped, ...verdicts.dropped], usage };
}

/** One batch of trivia for a pool. `existing` are the pool's questions, so none is repeated. */
export function writeTrivia(
  llm: Llm,
  models: Models,
  pool: PoolRef,
  count: number,
  existing: Pick<WrittenQuestion, 'question' | 'correct'>[],
): Promise<WriteResult> {
  const answers = [...new Set(existing.map((e) => e.correct))].slice(-200);
  return writeAndCheck(
    llm,
    models,
    { prompt: triviaPrompt(pool, count, answers), withDifficulty: false },
    (qs) => triviaCheckPrompt(pool, qs),
    existing,
  );
}

/** About five questions about a place, only from its Wikipedia text. */
export async function writePlace(
  llm: Llm,
  models: Models,
  place: { name: string; text: string; lang: string },
  count: number,
): Promise<WriteResult> {
  const res = await writeAndCheck(
    llm,
    models,
    { prompt: placePrompt(place.name, place.text, place.lang, count), withDifficulty: true },
    (qs) => placeCheckPrompt(place.name, place.text, qs),
    [],
  );
  return { ...res, kept: res.kept.slice(0, count) };
}
