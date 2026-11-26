/**
 * Team totals and ranks, from docs/v1-spec.md §4. Pure functions: Cloud Functions derive a
 * team's totals from scratch on every answer, and both apps rank teams with the same code.
 */
import { compareTeams, scoreAnswer, SPEED_BONUS_WINDOW_MS, type RankableTeam } from './rules';
import type { AnswerKind } from './types';

/** An answer as the server reads it, with timestamps already in milliseconds. */
export interface SubmittedAnswer {
  stopId: string;
  kind: AnswerKind;
  choiceIndex?: number;
  openedAtClientMs: number;
  answeredAtClientMs: number;
  elapsedMs: number;
}

export interface ScoredStop {
  id: string;
  correctIndex: number;
  skippedForAll: boolean;
}

/** `elapsedMs` may differ this much from the two client timestamps before it is distrusted. */
export const ELAPSED_TOLERANCE_MS = 2_000;

/**
 * The elapsed time the server scores with. The phone's clock is trusted so that offline
 * answers keep their timing, but only as far as it agrees with itself: a claim that does not
 * match `answeredAt − openedAt` gets no speed bonus instead of being rejected.
 */
export function trustedElapsedMs(
  a: Pick<SubmittedAnswer, 'elapsedMs' | 'openedAtClientMs' | 'answeredAtClientMs'>,
): number {
  const fromStamps = a.answeredAtClientMs - a.openedAtClientMs;
  const consistent =
    Number.isFinite(a.elapsedMs) && Math.abs(fromStamps - a.elapsedMs) <= ELAPSED_TOLERANCE_MS;
  if (!consistent) return SPEED_BONUS_WINDOW_MS;
  return Math.min(SPEED_BONUS_WINDOW_MS, Math.max(0, a.elapsedMs));
}

export interface TeamTotals {
  score: number;
  correctCount: number;
  /** Answers (including skips) on stops that are still in play. */
  stopsDone: number;
  /** The latest counted answer's client time, once every stop in play has an answer. */
  finishedAtMs?: number;
  /** Points and correctness per stop id, for writing back onto each answer. */
  perStop: Record<string, { points: number; correct: boolean }>;
}

/**
 * Derives a team's totals from all of its answers. Never increments, so a retried trigger,
 * a stop skipped for everyone, or an answer that synced late all give the same result.
 * Answers on a stop that was skipped for everyone, or that no longer exists, score nothing
 * and do not count.
 */
export function recomputeTeamTotals(answers: SubmittedAnswer[], stops: ScoredStop[]): TeamTotals {
  const inPlay = new Map(stops.filter((s) => !s.skippedForAll).map((s) => [s.id, s]));
  const totals: TeamTotals = { score: 0, correctCount: 0, stopsDone: 0, perStop: {} };
  let latestMs: number | undefined;
  let latestAnyMs: number | undefined;

  for (const answer of answers) {
    if (latestAnyMs === undefined || answer.answeredAtClientMs > latestAnyMs) {
      latestAnyMs = answer.answeredAtClientMs;
    }
    const stop = inPlay.get(answer.stopId);
    if (!stop) {
      totals.perStop[answer.stopId] = { points: 0, correct: false };
      continue;
    }
    const scored = scoreAnswer(
      answer.kind,
      answer.choiceIndex,
      stop.correctIndex,
      trustedElapsedMs(answer),
    );
    totals.perStop[answer.stopId] = scored;
    totals.score += scored.points;
    if (scored.correct) totals.correctCount += 1;
    totals.stopsDone += 1;
    if (latestMs === undefined || answer.answeredAtClientMs > latestMs) {
      latestMs = answer.answeredAtClientMs;
    }
  }

  if (inPlay.size > 0 && totals.stopsDone === inPlay.size) totals.finishedAtMs = latestMs;
  // Every stop it reached was removed for everyone: the team still finished, at its last answer.
  if (inPlay.size === 0 && answers.length > 0) totals.finishedAtMs = latestAnyMs;
  return totals;
}

export interface NamedTeam extends RankableTeam {
  id: string;
  name: string;
}

export type RankedTeam<T> = T & {
  /** 1-based. Teams that tie on score, correct count and walk time share a rank. */
  rank: number;
  tied: boolean;
};

/**
 * Sorts teams and numbers them. Ties share a rank ("2=", then 4), and are listed by name and
 * then id, so every phone shows the same order.
 */
export function rankTeams<T extends NamedTeam>(teams: T[]): RankedTeam<T>[] {
  const sorted = [...teams].sort(
    (a, b) => compareTeams(a, b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const ranked: RankedTeam<T>[] = [];
  sorted.forEach((team, i) => {
    const prev = ranked[i - 1];
    if (prev !== undefined && compareTeams(prev, team) === 0) {
      prev.tied = true;
      ranked.push({ ...team, rank: prev.rank, tied: true });
    } else {
      ranked.push({ ...team, rank: i + 1, tied: false });
    }
  });
  return ranked;
}

/**
 * The teams on a share card: the top `max` of a ranked list. When `teamId` is further down, it
 * takes the last place in the list, so a team's own card always shows the team.
 */
export function cardRows<T extends { id: string }>(ranked: T[], max: number, teamId?: string): T[] {
  const top = ranked.slice(0, Math.max(0, max));
  if (teamId === undefined || max < 1 || top.some((t) => t.id === teamId)) return top;
  const mine = ranked.find((t) => t.id === teamId);
  return mine ? [...ranked.slice(0, max - 1), mine] : top;
}

/** A team is still walking if it has started and has neither finished nor left. */
export function isWalking(t: {
  startedAt?: unknown;
  finishedAt?: unknown;
  leftAt?: unknown;
}): boolean {
  return t.startedAt != null && t.finishedAt == null && t.leftAt == null;
}

/**
 * Whether the creator should be told that everyone has finished: at least one team started,
 * and none is still walking. Teams that joined but never started do not hold it up.
 */
export function everyoneFinished(
  teams: { startedAt?: unknown; finishedAt?: unknown; leftAt?: unknown }[],
): boolean {
  return teams.some((t) => t.startedAt != null) && !teams.some(isWalking);
}
