import { describe, expect, it } from 'vitest';
import {
  everyoneFinished,
  rankTeams,
  recomputeTeamTotals,
  trustedElapsedMs,
  type ScoredStop,
  type SubmittedAnswer,
} from './totals';

const stops: ScoredStop[] = [
  { id: 's1', correctIndex: 0, skippedForAll: false },
  { id: 's2', correctIndex: 1, skippedForAll: false },
  { id: 's3', correctIndex: 2, skippedForAll: false },
];

function answer(
  stopId: string,
  choiceIndex: number,
  at: number,
  elapsedMs = 6_000,
): SubmittedAnswer {
  return {
    stopId,
    kind: 'answered',
    choiceIndex,
    openedAtClientMs: at - elapsedMs,
    answeredAtClientMs: at,
    elapsedMs,
  };
}

describe('trustedElapsedMs', () => {
  it('accepts a claim that matches the timestamps', () => {
    expect(
      trustedElapsedMs({ elapsedMs: 6_000, openedAtClientMs: 0, answeredAtClientMs: 6_500 }),
    ).toBe(6_000);
  });

  it('gives no bonus when the claim disagrees with the timestamps', () => {
    expect(
      trustedElapsedMs({ elapsedMs: 0, openedAtClientMs: 0, answeredAtClientMs: 15_000 }),
    ).toBe(20_000);
    expect(trustedElapsedMs({ elapsedMs: NaN, openedAtClientMs: 0, answeredAtClientMs: 0 })).toBe(
      20_000,
    );
  });

  it('clamps to the bonus window', () => {
    expect(trustedElapsedMs({ elapsedMs: -500, openedAtClientMs: 0, answeredAtClientMs: 0 })).toBe(
      0,
    );
    expect(
      trustedElapsedMs({ elapsedMs: 90_000, openedAtClientMs: 0, answeredAtClientMs: 90_000 }),
    ).toBe(20_000);
  });
});

describe('recomputeTeamTotals', () => {
  it('scores answers and is not finished until every stop has one', () => {
    const totals = recomputeTeamTotals(
      [answer('s1', 0, 1_000_000), answer('s2', 0, 2_000_000)],
      stops,
    );
    // s1 correct with 14 s left = 10 + 4; s2 wrong.
    expect(totals.score).toBe(14);
    expect(totals.correctCount).toBe(1);
    expect(totals.stopsDone).toBe(2);
    expect(totals.finishedAtMs).toBeUndefined();
    expect(totals.perStop.s2).toEqual({ correct: false, points: 0 });
  });

  it('finishes at the latest answer time, whatever order answers arrive in', () => {
    const totals = recomputeTeamTotals(
      [answer('s3', 2, 3_000_000), answer('s1', 0, 1_000_000), answer('s2', 1, 2_000_000)],
      stops,
    );
    expect(totals.stopsDone).toBe(3);
    expect(totals.finishedAtMs).toBe(3_000_000);
  });

  it('counts a skip as done with no points', () => {
    const skip: SubmittedAnswer = {
      ...answer('s1', 0, 1_000_000),
      kind: 'skipped',
      choiceIndex: undefined,
    };
    const totals = recomputeTeamTotals([skip], stops);
    expect(totals).toMatchObject({ score: 0, correctCount: 0, stopsDone: 1 });
  });

  it('gives "I\'m here" no speed bonus', () => {
    const totals = recomputeTeamTotals(
      [{ ...answer('s1', 0, 1_000_000, 0), kind: 'imHere' }],
      stops,
    );
    expect(totals.score).toBe(10);
  });

  it('voids a stop skipped for everyone, and can finish a team by doing so', () => {
    const answers = [answer('s1', 0, 1_000_000), answer('s2', 1, 2_000_000)];
    const skipped = stops.map((s) => (s.id === 's3' ? { ...s, skippedForAll: true } : s));
    expect(recomputeTeamTotals(answers, skipped).finishedAtMs).toBe(2_000_000);

    const voided = stops.map((s) => (s.id === 's1' ? { ...s, skippedForAll: true } : s));
    const totals = recomputeTeamTotals(answers, voided);
    expect(totals.score).toBe(14);
    expect(totals.stopsDone).toBe(1);
    expect(totals.perStop.s1).toEqual({ correct: false, points: 0 });
  });

  it('ignores an answer for a stop that no longer exists', () => {
    const totals = recomputeTeamTotals([answer('gone', 0, 1_000_000)], stops);
    expect(totals).toMatchObject({ score: 0, stopsDone: 0 });
  });

  it('never finishes a walk with no stops in play', () => {
    expect(recomputeTeamTotals([], []).finishedAtMs).toBeUndefined();
  });
});

describe('rankTeams', () => {
  const team = (id: string, name: string, score: number, walkTimeMs?: number) => ({
    id,
    name,
    score,
    correctCount: 0,
    walkTimeMs,
  });

  it('gives tied teams the same rank and skips the next one', () => {
    const ranked = rankTeams([
      team('c', 'Cedar', 50, 100),
      team('b', 'Birch', 80, 100),
      team('a', 'Alder', 80, 100),
      team('d', 'Dogwood', 96, 100),
    ]);
    expect(ranked.map((t) => [t.name, t.rank, t.tied])).toEqual([
      ['Dogwood', 1, false],
      ['Alder', 2, true],
      ['Birch', 2, true],
      ['Cedar', 4, false],
    ]);
  });

  it('does not change the input', () => {
    const input = [team('b', 'B', 1), team('a', 'A', 2)];
    rankTeams(input);
    expect(input[0]?.id).toBe('b');
  });
});

describe('everyoneFinished', () => {
  it('ignores teams that never started, and counts teams that left', () => {
    expect(everyoneFinished([{ startedAt: 1, finishedAt: 2 }, {}])).toBe(true);
    expect(
      everyoneFinished([
        { startedAt: 1, finishedAt: 2 },
        { startedAt: 1, leftAt: 3 },
      ]),
    ).toBe(true);
    expect(everyoneFinished([{ startedAt: 1, finishedAt: 2 }, { startedAt: 1 }])).toBe(false);
  });

  it('is false before anyone has started', () => {
    expect(everyoneFinished([{}, {}])).toBe(false);
    expect(everyoneFinished([])).toBe(false);
  });
});

describe('recomputeTeamTotals when every stop is removed', () => {
  it('still finishes a team that answered, at its last answer', () => {
    const t = recomputeTeamTotals(
      [
        {
          stopId: 'a',
          kind: 'answered',
          choiceIndex: 0,
          openedAtClientMs: 1_000,
          answeredAtClientMs: 5_000,
          elapsedMs: 4_000,
        },
      ],
      [{ id: 'a', correctIndex: 0, skippedForAll: true }],
    );
    expect(t).toMatchObject({ score: 0, stopsDone: 0, finishedAtMs: 5_000 });
  });

  it('does not finish a team that never answered', () => {
    expect(
      recomputeTeamTotals([], [{ id: 'a', correctIndex: 0, skippedForAll: true }]).finishedAtMs,
    ).toBeUndefined();
  });
});
