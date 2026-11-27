import { describe, expect, it } from 'vitest';

import {
  EMPTY_STATS,
  planTriviaPools,
  questionReportId,
  repeatsExisting,
  seededRng,
  shuffleAnswers,
  similarQuestions,
  statusAfter,
  writtenQuestionProblem,
  type BankStats,
  type WrittenQuestion,
} from './bank';
import {
  allPools,
  autoCategories,
  CATEGORIES,
  generatedWalkTitle,
  normaliseCategories,
  parsePoolKey,
  poolKey,
  subcategoriesFor,
} from './categories';

const stats = (
  over: Omit<Partial<BankStats>, 'reasons'> & { reasons?: Partial<BankStats['reasons']> } = {},
): BankStats => ({
  ...EMPTY_STATS,
  ...over,
  reasons: { ...EMPTY_STATS.reasons, ...over.reasons },
});

describe('categories', () => {
  it('has the first list, in order, with Local last', () => {
    expect(CATEGORIES.map((c) => c.label)).toEqual([
      'History',
      'Geography',
      'Science',
      'Nature & animals',
      'Space',
      'Sport',
      'Music',
      'Film & TV',
      'Food & drink',
      'Art & books',
      'Words & language',
      'Local',
    ]);
  });

  it('gives every trivia category six subcategories with unique ids', () => {
    for (const c of CATEGORIES.filter((c) => c.id !== 'local')) {
      expect(c.subcategories).toHaveLength(6);
      expect(new Set(c.subcategories.map((s) => s.id)).size).toBe(6);
    }
  });

  it('leaves out pools that do not suit a difficulty', () => {
    expect(subcategoriesFor('music', 'kids').map((s) => s.id)).not.toContain('theory');
    expect(subcategoriesFor('music', 'expert').map((s) => s.id)).toContain('theory');
    expect(subcategoriesFor('local', 'mixed')).toEqual([]);
  });

  it('lists every pool once, and round-trips pool keys', () => {
    const pools = allPools();
    expect(pools.length).toBe(11 * 6 * 3 - 4);
    expect(new Set(pools.map(poolKey)).size).toBe(pools.length);
    expect(parsePoolKey('history.medieval.kids')).toEqual({
      category: 'history',
      subcategory: 'medieval',
      difficulty: 'kids',
    });
    expect(parsePoolKey('music.theory.kids')).toBeUndefined();
    expect(parsePoolKey('nonsense')).toBeUndefined();
  });

  it('mixes the categories that suit the difficulty under Auto', () => {
    expect(autoCategories('kids')).not.toContain('words');
    expect(autoCategories('expert')).toContain('words');
    expect(autoCategories('mixed')).not.toContain('local');
  });

  it('keeps known categories only, once, in picker order', () => {
    expect(normaliseCategories(['local', 'history', 'nope', 'history'])).toEqual([
      'history',
      'local',
    ]);
    expect(normaliseCategories('history')).toEqual([]);
  });

  it('titles a generated walk', () => {
    expect(generatedWalkTitle(['history'], 'Kongens Nytorv')).toBe(
      'History walk from Kongens Nytorv',
    );
    expect(generatedWalkTitle([], 'Nyhavn')).toBe('Quiz walk from Nyhavn');
    expect(generatedWalkTitle(['history', 'space'], 'Nyhavn')).toBe('Quiz walk from Nyhavn');
    expect(generatedWalkTitle(['film'], '  ')).toBe('Film & TV walk');
    expect(generatedWalkTitle(['film'], 'x'.repeat(90))).toBe('Film & TV walk');
  });
});

describe('planTriviaPools', () => {
  it('spreads a one-category walk over every subcategory before repeating', () => {
    const pools = planTriviaPools(['history'], 'mixed', 8, seededRng(1));
    expect(pools).toHaveLength(8);
    const firstSix = new Set(pools.slice(0, 6).map((p) => p.subcategory));
    expect(firstSix.size).toBe(6);
    expect(pools.every((p) => p.category === 'history' && p.difficulty === 'mixed')).toBe(true);
  });

  it('takes turns between chosen categories and ignores Local', () => {
    const pools = planTriviaPools(['space', 'local', 'sport'], 'kids', 6, seededRng(2));
    const counts = { space: 0, sport: 0 } as Record<string, number>;
    pools.forEach((p) => (counts[p.category] = (counts[p.category] ?? 0) + 1));
    expect(counts).toEqual({ space: 3, sport: 3 });
  });

  it('uses Auto when only Local was chosen, or nothing', () => {
    const kids = new Set(autoCategories('kids'));
    for (const cats of [[], ['local']] as const) {
      const pools = planTriviaPools([...cats], 'kids', 12, seededRng(3));
      expect(pools).toHaveLength(12);
      expect(pools.every((p) => kids.has(p.category))).toBe(true);
      expect(new Set(pools.map((p) => p.category)).size).toBeGreaterThan(6);
    }
  });

  it('never plans a pool that does not exist', () => {
    const keys = new Set(allPools().map(poolKey));
    const pools = planTriviaPools(['music', 'art', 'film'], 'kids', 12, seededRng(4));
    expect(pools.every((p) => keys.has(poolKey(p)))).toBe(true);
  });
});

describe('shuffleAnswers', () => {
  it('keeps the correct answer findable and moves it around', () => {
    const slots = new Set<number>();
    const rng = seededRng(5);
    for (let i = 0; i < 40; i++) {
      const { options, correctIndex } = shuffleAnswers('Oslo', ['Bergen', 'Turku', 'Malmö'], rng);
      expect(options[correctIndex]).toBe('Oslo');
      expect([...options].sort()).toEqual(['Bergen', 'Malmö', 'Oslo', 'Turku']);
      slots.add(correctIndex);
    }
    expect(slots.size).toBe(4);
  });
});

describe('writtenQuestionProblem', () => {
  const good: WrittenQuestion = {
    question: 'Which planet is known as the Red Planet?',
    correct: 'Mars',
    wrong: ['Venus', 'Jupiter', 'Mercury'],
    explanation: 'Iron oxide on its surface makes Mars look red.',
  };

  it('accepts a good question', () => {
    expect(writtenQuestionProblem(good)).toBeUndefined();
  });

  it.each([
    [{ question: 'Mars?' }, 'question too short'],
    [{ question: 'Which planet is known as the Red Planet.' }, 'not a question'],
    [{ question: 'Who is currently the fastest man alive?' }, 'time-bound fact'],
    [{ question: 'Which team won the most recent World Cup?' }, 'time-bound fact'],
    [{ wrong: ['Venus', 'Jupiter'] }, 'needs three wrong answers'],
    [{ wrong: ['Venus', 'mars', 'Mercury'] }, 'repeated answer'],
    [{ wrong: ['Venus', 'All of the above', 'Mercury'] }, 'all/none of the above'],
    [{ correct: '' }, 'bad correct answer'],
    [{ explanation: 'x'.repeat(301) }, 'explanation too long'],
    [{ wrong: ['Venus', 'Saut&eacute;', 'Mercury'] }, 'html entity'],
    [{ question: 'Which planet is named Mars after the god of war?' }, 'answer in question'],
  ])('refuses %o', (change, problem) => {
    expect(writtenQuestionProblem({ ...good, ...change })).toBe(problem);
  });

  it('spots repeats of the same question or answer', () => {
    const pool = [{ question: 'Which planet is called the Red Planet?', correct: 'Mars' }];
    expect(
      repeatsExisting({ question: 'Which planet is called the red planet', correct: 'Mars' }, pool),
    ).toBe(true);
    expect(
      repeatsExisting(
        { question: 'Which planet is nicknamed the Red Planet?', correct: 'Mars' },
        pool,
      ),
    ).toBe(true);
    expect(
      repeatsExisting({ question: 'Which planet has the moon Phobos?', correct: 'Mars' }, pool),
    ).toBe(false);
    expect(
      repeatsExisting({ question: 'Which planet is called the Red Planet?', correct: 'Venus' }, []),
    ).toBe(false);
  });
});

describe('similarQuestions', () => {
  const q = (question: string, correct: string) => ({ question, correct });

  it('matches the same answer, an answer inside another, or mostly the same words', () => {
    expect(
      similarQuestions(
        q('Who found penicillin?', 'Alexander Fleming'),
        q('Which Scot discovered a mould?', 'Alexander Fleming'),
      ),
    ).toBe(true);
    expect(
      similarQuestions(
        q('What did Fleming find?', 'Penicillin'),
        q('What grew in his dish?', 'Penicillin mould'),
      ),
    ).toBe(true);
    expect(
      similarQuestions(
        q('What helps sailors find north?', 'Compass'),
        q('Which old Chinese tool points north?', 'The magnetic compass'),
      ),
    ).toBe(true);
    expect(
      similarQuestions(
        q('Which planet is the Red Planet?', 'Mars'),
        q('Which planet has rings?', 'Saturn'),
      ),
    ).toBe(false);
    expect(
      similarQuestions(
        q('Which sea is saltiest?', 'Dead Sea'),
        q('Which sea is between Europe and Africa?', 'Mediterranean'),
      ),
    ).toBe(false);
  });
});

describe('statusAfter', () => {
  it('hides a question after one offensive report', () => {
    expect(statusAfter('active', stats({ reasons: { offensive: 1 } }), false)).toBe('flagged');
  });

  it('flags after a few wrong-answer reports, not after one', () => {
    expect(statusAfter('active', stats({ reasons: { wrong: 2 } }), false)).toBe('active');
    expect(statusAfter('active', stats({ reasons: { wrong: 3 } }), false)).toBe('flagged');
    expect(statusAfter('active', stats({ reasons: { confusing: 5 } }), false)).toBe('flagged');
  });

  it('flags an unusual share of correct answers once enough teams answered', () => {
    expect(statusAfter('active', stats({ answered: 9, correct: 0 }), false)).toBe('active');
    expect(statusAfter('active', stats({ answered: 20, correct: 1 }), false)).toBe('flagged');
    expect(statusAfter('active', stats({ answered: 20, correct: 2 }), false)).toBe('active');
  });

  it('flags a question creators keep replacing', () => {
    expect(statusAfter('active', stats({ used: 8, replaced: 5 }), false)).toBe('flagged');
    expect(statusAfter('active', stats({ used: 20, replaced: 5 }), false)).toBe('active');
  });

  it('keeps a reviewed question unless new reports arrive', () => {
    expect(statusAfter('active', stats({ answered: 20, correct: 0 }), true)).toBe('active');
    expect(statusAfter('active', stats({ reasons: { offensive: 1 } }), true)).toBe('flagged');
  });

  it('never moves a flagged or blocked question by itself', () => {
    expect(statusAfter('flagged', stats(), false)).toBe('flagged');
    expect(statusAfter('blocked', stats(), false)).toBe('blocked');
  });
});

describe('questionReportId', () => {
  it('is one per person and bank question, across walks', () => {
    const a = questionReportId({ questionId: 'q1', walkId: 'w1', stopId: 's1' }, 'u1');
    const b = questionReportId({ questionId: 'q1', walkId: 'w2', stopId: 's9' }, 'u1');
    expect(a).toBe('bank_q1_u1');
    expect(b).toBe(a);
  });

  it('is one per person and stop for a creator-written question', () => {
    expect(questionReportId({ walkId: 'w1', stopId: 's1' }, 'u1')).toBe('stop_w1_s1_u1');
  });
});
