/**
 * OpenRouteService `foot-walking` (Directions V2), the WalkingRouter in use. The key lives in
 * Secret Manager (ORS_API_KEY) and never leaves Cloud Functions (spec §8).
 */
import { decodePolyline, type LatLng } from '@qualk/shared';

import { requestJson, ServiceError, type Fetch } from '../net';
import { RoutingError, SNAP_RADIUS_M, type RoutedLine, type WalkingRouter } from './router';

/** api.openrouteservice.org was retired on 2026-11-24 in favour of api.heigit.org. */
const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/foot-walking/json';

interface OrsResponse {
  routes?: {
    summary?: { distance?: number; duration?: number };
    geometry?: string;
    way_points?: number[];
  }[];
}

interface OrsErrorBody {
  error?: { code?: number; message?: string } | string;
}

/** ORS's routing error codes (api-reference/error-codes). */
const ORS_POINT_NOT_FOUND = 2010;
const ORS_ROUTE_NOT_FOUND = 2009;
const ORS_LIMIT_EXCEEDED = 2004;

/** "…within a radius of 350.0 meters of specified coordinate 2: 12.59 55.68." → 2 */
export function unroutableIndex(message: string): number | undefined {
  const m = /specified coordinate (\d+)/i.exec(message);
  return m ? Number(m[1]) : undefined;
}

export function orsRouter(apiKey: string, fetchImpl?: Fetch): WalkingRouter {
  return {
    async route(waypoints: LatLng[]): Promise<RoutedLine> {
      const body = {
        coordinates: waypoints.map((p) => [p.longitude, p.latitude]),
        radiuses: waypoints.map(() => SNAP_RADIUS_M),
        instructions: false,
        elevation: false,
        preference: 'recommended',
        options: { avoid_features: ['ferries'] },
      };
      let res: OrsResponse;
      try {
        res = await requestJson<OrsResponse>(
          ORS_URL,
          {
            method: 'POST',
            headers: {
              Authorization: apiKey,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(body),
          },
          { service: 'openrouteservice', timeoutMs: 15_000, retries: 1, fetch: fetchImpl },
        );
      } catch (err) {
        throw asRoutingError(err);
      }
      const route = res.routes?.[0];
      if (!route?.geometry) throw new RoutingError('noRoute', 'No route in the response.');
      const points = decodePolyline(route.geometry);
      return {
        points,
        polyline: route.geometry,
        distanceM: Math.round(route.summary?.distance ?? 0),
        durationS: Math.round(route.summary?.duration ?? 0),
        wayPoints: route.way_points ?? [],
      };
    },
  };
}

function asRoutingError(err: unknown): RoutingError {
  if (!(err instanceof ServiceError)) return new RoutingError('unavailable', String(err));
  if (err.transient) return new RoutingError('unavailable', err.message);
  const raw = (err.body as OrsErrorBody | undefined)?.error;
  const code = typeof raw === 'object' ? raw?.code : undefined;
  const message = typeof raw === 'object' ? (raw?.message ?? '') : String(raw ?? '');
  if (code === ORS_POINT_NOT_FOUND) {
    return new RoutingError('unroutable', message, unroutableIndex(message));
  }
  if (code === ORS_ROUTE_NOT_FOUND) return new RoutingError('noRoute', message);
  if (code === ORS_LIMIT_EXCEEDED) return new RoutingError('tooBig', message);
  return new RoutingError('unavailable', `${err.message} ${message}`.trim());
}
