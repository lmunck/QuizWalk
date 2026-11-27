/**
 * Where a team is in a walk, derived from its answers and the stops (spec §4, m1-design §7).
 * P3 never keeps the current stop in local state: killing the app mid-walk loses nothing.
 */
import { scoreAnswer } from './rules';
import type { AnswerKind } from './types';

export interface ProgressStop {
  id: string;
  order: number;
  correctIndex: number;
  skippedForAll: boolean;
}

export interface ProgressAnswer {
  stopId: string;
  kind: AnswerKind;
  choiceIndex?: number;
  elapsedMs?: number;
}

/** What a progress segment shows. Colour is never the only cue (✓ / ✕ / –). */
export type StopMark = 'correct' | 'wrong' | 'skipped' | 'current' | 'upcoming';

export interface WalkProgress<S extends ProgressStop = ProgressStop> {
  /** Stops still in play, in walk order. */
  stops: S[];
  /** The stop to walk to next, or undefined once every stop in play has an answer. */
  current?: S;
  /** 0-based index of `current` in `stops` (equals `stops.length` when finished). */
  currentIndex: number;
  /** Answers (including skips) on stops in play. */
  done: number;
  finished: boolean;
  marks: StopMark[];
  /** Points as this phone sees them: synced answers and ones still queued offline. */
  localScore: number;
  correctCount: number;
}

/** Whether an answer counts as right, from the answer itself and the stop. */
export function answerMark(answer: ProgressAnswer, stop: ProgressStop): StopMark {
  if (answer.kind === 'skipped') return 'skipped';
  return answer.choiceIndex === stop.correctIndex ? 'correct' : 'wrong';
}

export function walkProgress<S extends ProgressStop>(
  stops: S[],
  answers: ProgressAnswer[],
): WalkProgress<S> {
  const inPlay = stops.filter((s) => !s.skippedForAll).sort((a, b) => a.order - b.order);
  const byStop = new Map(answers.map((a) => [a.stopId, a]));

  let current: S | undefined;
  let currentIndex = inPlay.length;
  let done = 0;
  let localScore = 0;
  let correctCount = 0;

  const marks: StopMark[] = inPlay.map((stop, i) => {
    const answer = byStop.get(stop.id);
    if (answer) {
      done += 1;
      const scored = scoreAnswer(
        answer.kind,
        answer.choiceIndex,
        stop.correctIndex,
        answer.elapsedMs ?? Number.POSITIVE_INFINITY,
      );
      localScore += scored.points;
      if (scored.correct) correctCount += 1;
      return answerMark(answer, stop);
    }
    if (current === undefined) {
      current = stop;
      currentIndex = i;
      return 'current';
    }
    return 'upcoming';
  });

  return {
    stops: inPlay,
    current,
    currentIndex,
    done,
    finished: inPlay.length > 0 && current === undefined,
    marks,
    localScore,
    correctCount,
  };
}
