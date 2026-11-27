/**
 * Prompts for writing and checking questions (spec §8 "Question bank"). English only, British
 * spelling; only facts that stay true; a failed check drops the question.
 */
import {
  categoryById,
  subcategoriesFor,
  type Difficulty,
  type PoolRef,
  type WrittenQuestion,
} from '@qualk/shared';

const AUDIENCE: Record<Difficulty, string> = {
  kids: 'children aged 8 to 12. Use simple words and facts a curious child could know or guess',
  mixed:
    'a mixed group of adults and teenagers on a walk with friends or family. General knowledge: some easy, some that make people think',
  expert: 'keen quiz fans. Specific facts that most people would not know, but still fair',
};

export const WRITER_SYSTEM = `You write multiple-choice questions for Qualk, a quiz game played on a walk outdoors. Players read each question on a phone while standing in the street, so keep questions short and clear.

Rules for every question:
- English, with British spelling.
- One answer is clearly correct. The three wrong answers are plausible, of the same kind and similar length as the correct one, and clearly wrong to someone who knows.
- Only facts that stay true. Never ask about current office holders, current records, "the latest", "the most recent", rankings, prices, populations or anything else that changes over time.
- No trick questions, no "Which of these is NOT", no "all of the above" or "none of the above", no answers hidden in the question.
- Nothing offensive, frightening, sexual, political or about violence in detail. Suitable for a family.
- The question is at most 150 characters and ends with a question mark. Each answer is at most 40 characters.
- The explanation is one or two short sentences that teach the fact behind the answer.
- Every question is about something different. Don't repeat a fact or an answer.`;

export function writerSchema(withDifficulty: boolean) {
  const item: Record<string, unknown> = {
    type: 'object',
    properties: {
      question: { type: 'string' },
      correct: { type: 'string' },
      wrong: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
      explanation: { type: 'string' },
      ...(withDifficulty
        ? { difficulty: { type: 'string', enum: ['kids', 'mixed', 'expert'] } }
        : {}),
    },
    required: [
      'question',
      'correct',
      'wrong',
      'explanation',
      ...(withDifficulty ? ['difficulty'] : []),
    ],
  };
  return {
    type: 'object',
    properties: { questions: { type: 'array', items: item } },
    required: ['questions'],
  };
}

export function triviaPrompt(pool: PoolRef, count: number, existingAnswers: string[]): string {
  const cat = categoryById(pool.category);
  const sub = subcategoriesFor(pool.category, pool.difficulty).find(
    (s) => s.id === pool.subcategory,
  );
  const avoid =
    existingAnswers.length > 0
      ? `\n\nThese answers are already used by other questions in this pool. Don't write questions whose correct answer is one of them:\n${existingAnswers.map((a) => `- ${a}`).join('\n')}`
      : '';
  return `Write ${count} questions in the category "${cat.label}", about ${sub?.topic ?? pool.subcategory}.

The players are ${AUDIENCE[pool.difficulty]}.

Spread the questions over different parts of the topic, people, places and periods.${avoid}`;
}

export function placePrompt(name: string, text: string, lang: string, count: number): string {
  const language =
    lang === 'en'
      ? ''
      : ` The article is in the language with code "${lang}"; write the questions in English.`;
  return `Write ${count} questions about the place "${name}", for players standing next to it.

Use only facts stated in the Wikipedia article below. Don't add facts from elsewhere.${language}

Give each question a difficulty: "kids" for a fact a child could follow, "mixed" for general interest, "expert" for a detail. Aim for 2 kids, 2 mixed and 1 expert.

If the article doesn't support ${count} good questions, write fewer. If it supports none, return an empty list.

Article:
"""
${text}
"""`;
}

export const CHECKER_SYSTEM = `You are a strict fact-checker for a family quiz game. You check multiple-choice questions written by another model, one by one. A question passes only if every one of these holds:
1. The marked correct answer is correct.
2. None of the wrong answers is also correct, or arguably correct.
3. The fact stays true over time: no current office holders, records, rankings or "latest" facts.
4. The question is clear, has one reading, and is fair for the stated players.
5. Nothing in it is offensive or unsuitable for a family.
6. The explanation is correct.
When in doubt, fail the question. Give a short reason for every failure.`;

export const checkerSchema = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          pass: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['index', 'pass'],
      },
    },
  },
  required: ['verdicts'],
};

function listForCheck(questions: WrittenQuestion[]): string {
  return questions
    .map(
      (q, i) =>
        `${i}. ${q.question}\n   Correct: ${q.correct}\n   Wrong: ${q.wrong.join(' | ')}\n   Explanation: ${q.explanation}`,
    )
    .join('\n\n');
}

export function triviaCheckPrompt(pool: PoolRef, questions: WrittenQuestion[]): string {
  return `Category: ${categoryById(pool.category).label}. Players: ${AUDIENCE[pool.difficulty]}.

Check each question and return one verdict per question, with its index.

${listForCheck(questions)}`;
}

export function placeCheckPrompt(name: string, text: string, questions: WrittenQuestion[]): string {
  return `These questions are about the place "${name}" and must be supported by the Wikipedia article below. A question also fails if the article does not state its answer.

Article:
"""
${text}
"""

Check each question and return one verdict per question, with its index.

${listForCheck(questions)}`;
}
