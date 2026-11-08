import { describe, expect, it } from 'vitest';
import {
  canUnlock,
  canUseImHere,
  compareTeams,
  effectiveRadiusM,
  scoreAnswer,
  speedBonus,
} from './rules';

describe('effectiveRadiusM', () => {
  it('uses the stop radius when GPS is at least as good', () => {
    expect(effectiveRadiusM(40, 10)).toBe(40);
    expect(effectiveRadiusM(40, 40)).toBe(40);
  });

  it('widens to the accuracy, capped at max(radius, 60)', () => {
    expect(effectiveRadiusM(25, 35)).toBe(35);
    expect(effectiveRadiusM(25, 90)).toBe(60);
    expect(effectiveRadiusM(40, 55)).toBe(55);
    expect(effectiveRadiusM(40, 80)).toBe(60);
  });

  it('never shrinks a 60 m radius', () => {
    expect(effectiveRadiusM(60, 95)).toBe(60);
  });
});

describe('canUnlock', () => {
  it('unlocks inside the effective radius', () => {
    expect(canUnlock(39, 40, 10)).toBe(true);
    expect(canUnlock(40, 40, 10)).toBe(true);
    expect(canUnlock(41, 40, 10)).toBe(false);
    expect(canUnlock(58, 40, 80)).toBe(true);
  });

  it('ignores fixes worse than 100 m', () => {
    expect(canUnlock(0, 40, 101)).toBe(false);
    expect(canUnlock(0, 40, 100)).toBe(true);
  });
});

describe('canUseImHere', () => {
  it('is allowed up to 150 m', () => {
    expect(canUseImHere(150)).toBe(true);
    expect(canUseImHere(151)).toBe(false);
  });
});

describe('speedBonus', () => {
  it('matches the spec example: 14 s left gives 4', () => {
    expect(speedBonus(6_000)).toBe(4);
  });

  it('is 5 at once, 0 after 20 s, and clamps odd clocks', () => {
    expect(speedBonus(0)).toBe(5);
    expect(speedBonus(-500)).toBe(5);
    expect(speedBonus(20_000)).toBe(0);
    expect(speedBonus(60_000)).toBe(0);
    expect(speedBonus(19_999)).toBe(1);
  });
});

describe('scoreAnswer', () => {
  it('gives 10 + speed bonus for a correct answer', () => {
    expect(scoreAnswer('answered', 2, 2, 6_000)).toEqual({ correct: true, points: 14 });
  });

  it('gives 0 for a wrong answer', () => {
    expect(scoreAnswer('answered', 1, 2, 0)).toEqual({ correct: false, points: 0 });
  });

  it("gives no speed bonus for I'm here", () => {
    expect(scoreAnswer('imHere', 2, 2, 0)).toEqual({ correct: true, points: 10 });
  });

  it('gives 0 for a skip', () => {
    expect(scoreAnswer('skipped', undefined, 2, 0)).toEqual({ correct: false, points: 0 });
  });
});

describe('compareTeams', () => {
  const rank = (teams: Parameters<typeof compareTeams>[0][]) =>
    [...teams].sort(compareTeams).map((t) => t.score * 1000 + t.correctCount);

  it('orders by score, then correct count', () => {
    expect(
      rank([
        { score: 50, correctCount: 4, finishedAtMs: 1 },
        { score: 60, correctCount: 5, finishedAtMs: 2 },
        { score: 50, correctCount: 5, finishedAtMs: 3 },
      ]),
    ).toEqual([60005, 50005, 50004]);
  });

  it('then by finish time, with unfinished teams last', () => {
    const early = { score: 40, correctCount: 4, finishedAtMs: 100 };
    const late = { score: 40, correctCount: 4, finishedAtMs: 200 };
    const unfinished = { score: 40, correctCount: 4 };
    expect([unfinished, late, early].sort(compareTeams)).toEqual([early, late, unfinished]);
  });
});
