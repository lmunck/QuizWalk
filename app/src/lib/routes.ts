/**
 * Where a card or a join lands (spec §3 C1). Players are sent to where their walk is, worked
 * out from the walk and the team, never from local state.
 */
import type { Href } from 'expo-router';

import type { WalkStatus } from '@qualk/shared';

export function creatorHref(walk: { id: string; status: WalkStatus }): Href {
  switch (walk.status) {
    case 'draft':
      return `/walk/${walk.id}/route`;
    case 'ready':
      return `/walk/${walk.id}/share`;
    case 'open':
      return `/walk/${walk.id}/monitor`;
    case 'ended':
      return `/walk/${walk.id}/results`;
  }
}

export function playerHref(
  walk: { id: string; status: WalkStatus },
  team: { startedAt?: unknown; leftAt?: unknown; finishedAt?: unknown } | undefined,
  finishedLocally = false,
): Href {
  if (walk.status === 'ended') return `/play/${walk.id}/results`;
  if (!team || team.leftAt) return `/play/${walk.id}`;
  if (!team.startedAt || walk.status !== 'open') return `/play/${walk.id}/lobby`;
  if (team.finishedAt || finishedLocally) return `/play/${walk.id}/finish`;
  return `/play/${walk.id}/stop`;
}

/**
 * Where a tapped notification leads (spec §11). The kinds are set by the server's pushes
 * (functions/src/push.ts) and by pocket mode's arrival notification. Every target redirects by
 * itself if the walk has moved on since, so a late tap still lands somewhere sensible.
 */
export function notificationHref(data: unknown): Href | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const { kind, walkId, stopId } = data as Record<string, unknown>;
  if (typeof walkId !== 'string' || walkId === '') return undefined;
  switch (kind) {
    case 'arrived':
      return typeof stopId === 'string'
        ? { pathname: '/play/[walkId]/question', params: { walkId, stopId } }
        : `/play/${walkId}/stop`;
    case 'open':
      return `/play/${walkId}/lobby`;
    case 'ended':
      return `/play/${walkId}/results`;
    case 'blocked':
    case 'allFinished':
    case 'teamFinished':
      return `/walk/${walkId}/monitor`;
    default:
      return undefined;
  }
}
