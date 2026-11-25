/** Game rules, from docs/v1-spec.md §4. Pure functions, used by the app and Cloud Functions. */
import type { AnswerKind, WalkOpenFor } from './types';

/** Fixes with accuracy worse than this are ignored for unlocking. */
export const MAX_UNLOCK_ACCURACY_M = 100;
/** Radius cap used when GPS accuracy is worse than the stop's radius (G5). */
export const WIDENED_RADIUS_CAP_M = 60;
/** "I'm here" is allowed within this distance (G6). */
export const IM_HERE_MAX_DISTANCE_M = 150;

export const POINTS_CORRECT = 10;
export const SPEED_BONUS_MAX = 5;
export const SPEED_BONUS_WINDOW_MS = 20_000;

/** A walk is ended automatically this long after it was opened, by the creator's choice. */
export const OPEN_FOR_MS: Record<WalkOpenFor, number> = {
  day: 12 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** When an open walk ends by itself. A walk without `openFor` counts as `day`. */
export function walkEndsAtMs(openedAtMs: number, openFor: WalkOpenFor = 'day'): number {
  return openedAtMs + OPEN_FOR_MS[openFor];
}

/**
 * Effective unlock radius:
 * `radius` if accuracy ≤ radius, else `min(accuracy, max(radius, 60))`.
 */
export function effectiveRadiusM(radiusM: number, accuracyM: number): number {
  if (accuracyM <= radiusM) return radiusM;
  return Math.min(accuracyM, Math.max(radiusM, WIDENED_RADIUS_CAP_M));
}

/** Whether a location fix unlocks the stop. */
export function canUnlock(distanceM: number, radiusM: number, accuracyM: number): boolean {
  if (accuracyM > MAX_UNLOCK_ACCURACY_M) return false;
  return distanceM <= effectiveRadiusM(radiusM, accuracyM);
}

/**
 * "I'm here" is allowed when the team is plausibly within 150 m: `distance − accuracy ≤ 150`.
 * Subtracting the accuracy keeps a team with poor GPS from being stranded at the stop.
 */
export function canUseImHere(distanceM: number, accuracyM: number): boolean {
  return distanceM - Math.max(0, accuracyM) <= IM_HERE_MAX_DISTANCE_M;
}

/** Speed bonus `ceil(5 × secondsLeft / 20)`, 0–5, from question open to answer. */
export function speedBonus(elapsedMs: number): number {
  const elapsed = Math.max(0, elapsedMs);
  const msLeft = Math.max(0, SPEED_BONUS_WINDOW_MS - elapsed);
  return Math.ceil((SPEED_BONUS_MAX * msLeft) / SPEED_BONUS_WINDOW_MS);
}

export interface ScoredAnswer {
  correct: boolean;
  points: number;
}

/**
 * Points for one answer.
 * - `answered`: 10 if correct, plus the speed bonus.
 * - `imHere`: 10 if correct, no speed bonus.
 * - `skipped`: 0.
 */
export function scoreAnswer(
  kind: AnswerKind,
  choiceIndex: number | undefined,
  correctIndex: number,
  elapsedMs: number,
): ScoredAnswer {
  if (kind === 'skipped' || choiceIndex === undefined) return { correct: false, points: 0 };
  const correct = choiceIndex === correctIndex;
  if (!correct) return { correct, points: 0 };
  const bonus = kind === 'answered' ? speedBonus(elapsedMs) : 0;
  return { correct, points: POINTS_CORRECT + bonus };
}

export interface RankableTeam {
  score: number;
  correctCount: number;
  /**
   * Walk time in ms (`finishedAt − startedAt`, both from the team's own phone clock),
   * or undefined if the team has not finished.
   */
  walkTimeMs?: number;
}

/** Walk time for a team, or undefined until it has both started and finished. */
export function walkTimeMs(startedAtMs?: number, finishedAtMs?: number): number | undefined {
  if (startedAtMs === undefined || finishedAtMs === undefined) return undefined;
  return Math.max(0, finishedAtMs - startedAtMs);
}

/**
 * Ranking order: score ↓, then correct count ↓, then walk time ↑.
 * Walk time rather than time of day, so a team that started late is not penalised.
 * Unfinished teams rank after finished teams when score and correct count are equal.
 * Use with `Array.prototype.sort`.
 */
export function compareTeams(a: RankableTeam, b: RankableTeam): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  const aTime = a.walkTimeMs ?? Number.POSITIVE_INFINITY;
  const bTime = b.walkTimeMs ?? Number.POSITIVE_INFINITY;
  if (aTime === bTime) return 0;
  return aTime < bTime ? -1 : 1;
}

/** Walking pace and per-stop allowance behind every "about N min" shown in the app. */
export const WALKING_SPEED_M_PER_MIN = 75; // 4.5 km/h
export const MINUTES_PER_STOP = 2;

/** Estimated minutes for a walk: the route at 4.5 km/h plus 2 minutes per stop. */
export function estimateWalkMinutes(distanceM: number, stopCount: number): number {
  return Math.round(
    Math.max(0, distanceM) / WALKING_SPEED_M_PER_MIN + stopCount * MINUTES_PER_STOP,
  );
}
