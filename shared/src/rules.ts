/** Game rules, from docs/v1-spec.md §4. Pure functions, used by the app and Cloud Functions. */
import type { AnswerKind } from './types';

/** Fixes with accuracy worse than this are ignored for unlocking. */
export const MAX_UNLOCK_ACCURACY_M = 100;
/** Radius cap used when GPS accuracy is worse than the stop's radius (G5). */
export const WIDENED_RADIUS_CAP_M = 60;
/** "I'm here" is allowed within this distance (G6). */
export const IM_HERE_MAX_DISTANCE_M = 150;

export const POINTS_CORRECT = 10;
export const SPEED_BONUS_MAX = 5;
export const SPEED_BONUS_WINDOW_MS = 20_000;

/** A walk open this long is ended automatically. */
export const AUTO_END_AFTER_MS = 12 * 60 * 60 * 1000;

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

export function canUseImHere(distanceM: number): boolean {
  return distanceM <= IM_HERE_MAX_DISTANCE_M;
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
  /** Finish time in ms since epoch, or undefined if the team has not finished. */
  finishedAtMs?: number;
}

/**
 * Ranking order: score ↓, then correct count ↓, then finish time ↑.
 * Unfinished teams rank after finished teams when score and correct count are equal.
 * Use with `Array.prototype.sort`.
 */
export function compareTeams(a: RankableTeam, b: RankableTeam): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  const aFinish = a.finishedAtMs ?? Number.POSITIVE_INFINITY;
  const bFinish = b.finishedAtMs ?? Number.POSITIVE_INFINITY;
  if (aFinish === bFinish) return 0;
  return aFinish < bFinish ? -1 : 1;
}
