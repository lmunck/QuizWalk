import { describe, expect, it } from 'vitest';
import { walkProgress } from './progress';

const stops = [
  { id: 'c', order: 2, correctIndex: 0, skippedForAll: false },
  { id: 'a', order: 0, correctIndex: 1, skippedForAll: false },
  { id: 'b', order: 1, correctIndex: 2, skippedForAll: false },
];

describe('walkProgress', () => {
  it('starts at the first stop in order', () => {
    const p = walkProgress(stops, []);
    expect(p.current?.id).toBe('a');
    expect(p.currentIndex).toBe(0);
    expect(p.marks).toEqual(['current', 'upcoming', 'upcoming']);
    expect(p.finished).toBe(false);
  });

  it('moves on after an answer or a skip, and marks each', () => {
    const p = walkProgress(stops, [
      { stopId: 'a', kind: 'answered', choiceIndex: 1, elapsedMs: 4_000 },
      { stopId: 'b', kind: 'skipped' },
    ]);
    expect(p.current?.id).toBe('c');
    expect(p.done).toBe(2);
    expect(p.marks).toEqual(['correct', 'skipped', 'current']);
    expect(p.localScore).toBe(10 + 4);
    expect(p.correctCount).toBe(1);
  });

  it('counts I’m here without a speed bonus', () => {
    const p = walkProgress(stops, [{ stopId: 'a', kind: 'imHere', choiceIndex: 1 }]);
    expect(p.localScore).toBe(10);
  });

  it('marks a wrong answer', () => {
    const p = walkProgress(stops, [{ stopId: 'a', kind: 'answered', choiceIndex: 0 }]);
    expect(p.marks[0]).toBe('wrong');
    expect(p.localScore).toBe(0);
  });

  it('drops stops skipped for everyone and still finishes', () => {
    const p = walkProgress(
      stops.map((s) => (s.id === 'c' ? { ...s, skippedForAll: true } : s)),
      [
        { stopId: 'a', kind: 'answered', choiceIndex: 1 },
        { stopId: 'b', kind: 'answered', choiceIndex: 2 },
        { stopId: 'c', kind: 'answered', choiceIndex: 0 },
      ],
    );
    expect(p.stops.map((s) => s.id)).toEqual(['a', 'b']);
    expect(p.finished).toBe(true);
    expect(p.current).toBeUndefined();
    expect(p.currentIndex).toBe(2);
    expect(p.localScore).toBe(20);
  });

  it('is not finished with no stops', () => {
    expect(walkProgress([], []).finished).toBe(false);
  });
});
