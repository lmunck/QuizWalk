/** Ranked teams for a walk, with the shared ranking code every phone uses (spec §4 Ranking). */
import { isWalking, rankTeams, walkTimeMs, type RankedTeam } from '@qualk/shared';
import { useMemo } from 'react';

import { useTeams, type Team } from '@/data/teams';

export type Standing = RankedTeam<
  Team & { walkTimeMs?: number; finished: boolean; walking: boolean }
>;

export function rank(teams: Team[]): Standing[] {
  return rankTeams(
    teams.map((t) => ({
      ...t,
      walkTimeMs: walkTimeMs(t.startedAt?.toMillis(), t.finishedAt?.toMillis()),
      finished: t.finishedAt != null,
      walking: isWalking(t),
    })),
  );
}

export function useStandings(walkId: string | undefined, opts: { startedOnly?: boolean } = {}) {
  const teams = useTeams(walkId);
  const startedOnly = opts.startedOnly === true;
  const standings = useMemo(
    () => rank(startedOnly ? teams.data.filter((t) => t.startedAt) : teams.data),
    [teams.data, startedOnly],
  );
  return { standings, loading: teams.loading, fromCache: teams.fromCache, all: teams.data };
}
