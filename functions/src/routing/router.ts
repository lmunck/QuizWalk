/**
 * The one swappable routing interface (spec §1 Routing, §19). OpenRouteService implements it
 * today; a self-hosted or paid router would implement the same two methods.
 */
import type { LatLng } from '@qualk/shared';

export interface RoutedLine {
  /** The route's points, decoded. */
  points: LatLng[];
  /** The same points as an encoded polyline (precision 5), as stored on the walk. */
  polyline: string;
  distanceM: number;
  durationS: number;
  /** For each waypoint, the index in `points` where the route passes it, snapped to a path. */
  wayPoints: number[];
}

export type RoutingFailure =
  /** A waypoint has no walkable path within the snapping radius; `pointIndex` says which. */
  | 'unroutable'
  /** No route joins the waypoints (islands, closed areas). */
  | 'noRoute'
  /** Beyond the service's limits (distance or number of waypoints). */
  | 'tooBig'
  /** The service failed, timed out or is rate limiting us. */
  | 'unavailable';

export class RoutingError extends Error {
  constructor(
    readonly failure: RoutingFailure,
    message: string,
    readonly pointIndex?: number,
  ) {
    super(message);
  }
}

export interface WalkingRouter {
  /** A walking route through the waypoints in order. Throws RoutingError. */
  route(waypoints: LatLng[]): Promise<RoutedLine>;
}

/** Points further than this from any walkable path can't be routed (ORS's default radius). */
export const SNAP_RADIUS_M = 350;
