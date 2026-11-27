/**
 * reroute: after C4 saves a change to the stops (spec §8). Routes Start → stop 1 → … → last
 * stop along walkable paths, and marks stops a team on the nearest path might not reach
 * ("Off path") or that sit on water ("Pin is on water"). Pins are not moved: the creator put
 * them there, and C4 says when one looks wrong.
 */
import {
  distanceM,
  isOffPath,
  routeKey,
  type LatLng,
  type RerouteResponse,
  type RerouteStop,
  type StopWarning,
} from '@qualk/shared';
import { FieldValue, type Firestore, type GeoPoint } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { ownedWalk } from '../core';
import { QualkError } from '../errors';
import { inWater, type Overpass } from '../places/overpass';
import { RoutingError, type RoutedLine, type WalkingRouter } from './router';

const toLatLng = (g: GeoPoint): LatLng => ({ latitude: g.latitude, longitude: g.longitude });

/** Routing calls per reroute: one, plus one for each stop that has no path near it. */
const MAX_CALLS = 4;

export async function reroute(
  db: Firestore,
  router: WalkingRouter,
  overpass: Overpass,
  uid: string,
  walkId: string,
): Promise<RerouteResponse> {
  const { ref, walk } = await ownedWalk(db, uid, walkId);
  if (walk.status !== 'draft' && walk.status !== 'ready') {
    throw new QualkError('failed-precondition', 'The route can’t change once the walk is open.');
  }
  const snap = await ref.collection('stops').get();
  const stops = snap.docs
    .map((d) => ({
      id: d.id,
      ref: d.ref,
      order: d.get('order') as number,
      location: toLatLng(d.get('location') as GeoPoint),
      radiusM: (d.get('radiusM') as number) ?? 40,
      warnings: (d.get('warnings') as StopWarning[] | undefined) ?? [],
    }))
    .sort((a, b) => a.order - b.order);
  const start = toLatLng(walk.start as GeoPoint);

  if (stops.length === 0) {
    await ref.update({ route: null, distanceM: 0, updatedAt: FieldValue.serverTimestamp() });
    return { route: null, distanceM: 0, stops: [] };
  }

  // Stops with no path within reach are left out of the route and marked.
  const unroutable = new Set<string>();
  let routed: RoutedLine | undefined;
  let routedStops = stops;
  for (let calls = 0; calls < MAX_CALLS && !routed; calls++) {
    routedStops = stops.filter((s) => !unroutable.has(s.id));
    if (routedStops.length === 0) break;
    try {
      routed = await router.route([start, ...routedStops.map((s) => s.location)]);
    } catch (err) {
      if (!(err instanceof RoutingError)) throw err;
      if (err.failure === 'unroutable' && err.pointIndex !== undefined && err.pointIndex > 0) {
        const bad = routedStops[err.pointIndex - 1];
        if (bad) unroutable.add(bad.id);
        continue;
      }
      if (err.failure === 'unroutable') {
        throw new QualkError('failed-precondition', 'The start pin isn’t near a path.', {
          reason: 'unroutable',
        });
      }
      throw new QualkError('unavailable', 'Routing isn’t available right now. Try again.', {
        reason: err.failure === 'tooBig' ? 'tooBig' : 'unavailable',
      });
    }
  }
  if (!routed) {
    throw new QualkError('unavailable', 'Routing isn’t available right now. Try again.', {
      reason: 'unavailable',
    });
  }

  const offsets = new Map<string, number | null>();
  routedStops.forEach((s, i) => {
    const snapped = routed.points[routed.wayPoints[i + 1] ?? -1];
    offsets.set(s.id, snapped ? Math.round(distanceM(s.location, snapped)) : null);
  });
  for (const id of unroutable) offsets.set(id, null);

  const off = stops.filter((s) => {
    const o = offsets.get(s.id);
    return o === null || o === undefined || isOffPath(o, s.radiusM);
  });
  let water: boolean[] = [];
  try {
    water = await inWater(
      overpass,
      off.map((s) => s.location),
    );
  } catch (err) {
    logger.warn('Water check failed', { walkId, err: String(err) });
  }
  const onWater = new Set(off.filter((_, i) => water[i]).map((s) => s.id));

  const result: RerouteStop[] = stops.map((s) => {
    const offsetM = offsets.get(s.id) ?? null;
    const kept = s.warnings.filter((w) => w === 'unverified');
    const flagged: StopWarning[] = onWater.has(s.id)
      ? ['onWater']
      : off.some((o) => o.id === s.id)
        ? ['offPath']
        : [];
    return { stopId: s.id, offsetM, warnings: [...kept, ...flagged] };
  });

  // A route that skips a stop doesn't match the pins, so the walk's distance stays straight.
  const route = {
    polyline: routed.polyline,
    distanceM: routed.distanceM,
    durationS: routed.durationS,
    ...(unroutable.size === 0
      ? {
          key: routeKey(
            start,
            stops.map((s) => s.location),
          ),
        }
      : {}),
  };
  const batch = db.batch();
  batch.update(ref, {
    route,
    distanceM: routed.distanceM,
    updatedAt: FieldValue.serverTimestamp(),
  });
  stops.forEach((s, i) => {
    const warnings = result[i]!.warnings;
    if (warnings.join() !== s.warnings.join()) batch.update(s.ref, { warnings });
  });
  await batch.commit();
  return { route, distanceM: routed.distanceM, stops: result };
}
