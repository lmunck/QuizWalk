/**
 * Naming stops (spec §8 Next, step 1; m4-generation-design §4). Each stop moves to a named
 * feature within about 50 m of the path where there is one, otherwise it takes its street's
 * name. Stops stay on the route, so they can be reached on foot, and stay far enough apart
 * that their unlock circles don't overlap.
 */
import {
  distanceM,
  lineLengthM,
  projectOntoLine,
  type LatLng,
  type SpacedStop,
} from '@qualk/shared';

import type { OsmFeature, OsmStreet } from './overpass';

/** A feature counts when it is within this distance of the path. */
export const FEATURE_MAX_OFFSET_M = 50;
/** A stop may move this far along the route to reach a feature. */
export const MAX_SHIFT_M = 80;
/** Moved stops stay this far apart along the route (two 60 m unlock circles). */
export const MIN_GAP_M = 120;
/** A documented place this close to a stop can give it a Local question. */
export const PLACE_MAX_DISTANCE_M = 120;

export interface NamedStop {
  location: LatLng;
  alongM: number;
  /** Empty when nothing nearby has a name; the app then shows "Stop 3". */
  placeName: string;
  /** The landmark the stop was moved to, if any. */
  featureId?: string;
  /** The nearest documented place (with a Wikidata id), for a Local question. */
  place?: OsmFeature;
}

/** Distance along a loop, either way round. */
function loopGap(a: number, b: number, length: number): number {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

function distanceToStreet(p: LatLng, street: OsmStreet): number {
  if (street.points.length === 1) return distanceM(p, street.points[0] as LatLng);
  return projectOntoLine(street.points, p).offsetM;
}

/** The name of the nearest street within reach, or ''. */
export function streetNameAt(p: LatLng, streets: OsmStreet[], maxM = 35): string {
  let best = '';
  let bestM = maxM;
  for (const s of streets) {
    const d = distanceToStreet(p, s);
    if (d <= bestM) {
      best = s.name;
      bestM = d;
    }
  }
  return best;
}

export function nameStops(
  route: LatLng[],
  planned: SpacedStop[],
  features: OsmFeature[],
  streets: OsmStreet[],
): NamedStop[] {
  const length = Math.max(1, lineLengthM(route));
  const landmarks = features.filter((f) => f.score > 0);
  const used = new Set<string>();
  const finalAlong: number[] = [];
  const out: NamedStop[] = [];

  planned.forEach((stop, i) => {
    const prevAlong = i > 0 ? (finalAlong[i - 1] as number) : undefined;
    const nextAlong = planned[i + 1]?.alongM;
    const candidates = landmarks
      .filter((f) => !used.has(f.id))
      .map((f) => ({ f, proj: projectOntoLine(route, f.location, stop.alongM) }))
      .filter(
        ({ proj }) =>
          proj.offsetM <= FEATURE_MAX_OFFSET_M &&
          loopGap(proj.alongM, stop.alongM, length) <= MAX_SHIFT_M &&
          (prevAlong === undefined || loopGap(proj.alongM, prevAlong, length) >= MIN_GAP_M) &&
          (nextAlong === undefined || loopGap(proj.alongM, nextAlong, length) >= MIN_GAP_M) &&
          (i === 0 || loopGap(proj.alongM, finalAlong[0] as number, length) >= MIN_GAP_M),
      )
      .sort(
        (a, b) =>
          b.f.score - a.f.score ||
          loopGap(a.proj.alongM, stop.alongM, length) - loopGap(b.proj.alongM, stop.alongM, length),
      );

    const pick = candidates[0];
    let named: NamedStop;
    if (pick) {
      used.add(pick.f.id);
      named = {
        location: pick.proj.point,
        alongM: pick.proj.alongM,
        placeName: pick.f.name,
        featureId: pick.f.id,
      };
    } else {
      named = {
        location: stop.location,
        alongM: stop.alongM,
        placeName: streetNameAt(stop.location, streets),
      };
    }
    finalAlong.push(named.alongM);
    out.push(named);
  });

  // The nearest documented place to each stop, used by one stop at most.
  const placed = new Set<string>();
  const documented = features.filter((f) => f.wikidata && f.notable);
  for (const s of out) {
    const own = documented.find((f) => f.id === s.featureId);
    const nearest =
      own ??
      documented
        .filter((f) => !placed.has(f.wikidata as string))
        .map((f) => ({ f, d: distanceM(f.location, s.location) }))
        .filter(({ d }) => d <= PLACE_MAX_DISTANCE_M)
        // A landmark before a street or a building, then the nearest.
        .sort((a, b) => Number(b.f.score > 0) - Number(a.f.score > 0) || a.d - b.d)[0]?.f;
    if (nearest && !placed.has(nearest.wikidata as string)) {
      placed.add(nearest.wikidata as string);
      s.place = nearest;
    }
  }
  return out;
}
