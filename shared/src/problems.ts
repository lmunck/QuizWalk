/**
 * What stops a walk from being published or opened (spec §3 C4, §8 publishWalk / openWalk).
 * One function, used by the route builder, publishWalk and openWalk, so the phone and the
 * server always give the same answer with the same words.
 */
import type { StopDoc, StopWarning } from './types';

export const MAX_STOPS = 12;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 4;

export type ProblemCode =
  | 'noTitle'
  | 'noStops'
  | 'tooManyStops'
  | 'noQuestion'
  | 'tooFewOptions'
  | 'tooManyOptions'
  | 'emptyOption'
  | 'noCorrect'
  | StopWarning;

export interface WalkProblem {
  code: ProblemCode;
  /** Set for problems that belong to one stop. */
  stopId?: string;
  /** 1-based position of that stop, as the creator sees it. */
  stopNumber?: number;
  /** Short and specific: "Stop 3 needs a question". */
  message: string;
}

export interface WalkProblems {
  /** Anything here stops Publish and Open walk. */
  blocking: WalkProblem[];
  /** Shown quietly on the stop's row; never blocks. */
  warnings: WalkProblem[];
}

type CheckedStop = Pick<StopDoc, 'order' | 'question' | 'options' | 'correctIndex'> & {
  id: string;
  warnings?: StopWarning[];
};

const WARNING_TEXT: Record<StopWarning, string> = {
  onWater: 'Pin is on water',
  offPath: 'Off path',
  unverified: 'Check this answer',
};

/** Problems on one stop. `stopNumber` is 1-based. */
export function stopProblems(stop: CheckedStop, stopNumber: number): WalkProblems {
  const blocking: WalkProblem[] = [];
  const at = { stopId: stop.id, stopNumber };
  const options = stop.options ?? [];
  const filled = options.filter((o) => o.trim().length > 0);

  if (!stop.question || stop.question.trim().length === 0) {
    blocking.push({ code: 'noQuestion', ...at, message: `Stop ${stopNumber} needs a question` });
  }
  if (filled.length < MIN_OPTIONS) {
    blocking.push({
      code: 'tooFewOptions',
      ...at,
      message: `Stop ${stopNumber} needs at least ${MIN_OPTIONS} answers`,
    });
  } else if (filled.length < options.length) {
    blocking.push({
      code: 'emptyOption',
      ...at,
      message: `Stop ${stopNumber} has an empty answer`,
    });
  }
  if (options.length > MAX_OPTIONS) {
    blocking.push({
      code: 'tooManyOptions',
      ...at,
      message: `Stop ${stopNumber} has more than ${MAX_OPTIONS} answers`,
    });
  }
  const correct = options[stop.correctIndex];
  if (
    !Number.isInteger(stop.correctIndex) ||
    correct === undefined ||
    correct.trim().length === 0
  ) {
    blocking.push({
      code: 'noCorrect',
      ...at,
      message: `Stop ${stopNumber} needs a correct answer`,
    });
  }

  const warnings = (stop.warnings ?? []).map((w) => ({
    code: w,
    ...at,
    message: WARNING_TEXT[w],
  }));
  return { blocking, warnings };
}

/** All problems with a walk and its stops. Stops are checked in their play order. */
export function walkProblems(walk: { title: string }, stops: CheckedStop[]): WalkProblems {
  const blocking: WalkProblem[] = [];
  const warnings: WalkProblem[] = [];

  if (!walk.title || walk.title.trim().length === 0) {
    blocking.push({ code: 'noTitle', message: 'The walk needs a title' });
  }
  if (stops.length === 0) {
    blocking.push({ code: 'noStops', message: 'Add at least one stop' });
  }
  if (stops.length > MAX_STOPS) {
    blocking.push({ code: 'tooManyStops', message: `A walk can have at most ${MAX_STOPS} stops` });
  }

  [...stops]
    .sort((a, b) => a.order - b.order)
    .forEach((stop, i) => {
      const p = stopProblems(stop, i + 1);
      blocking.push(...p.blocking);
      warnings.push(...p.warnings);
    });

  return { blocking, warnings };
}
