/**
 * OpenStreetMap Overpass (spec §8 Next, step 1): one query finds named features, documented
 * places (with a Wikidata id) and street names around a walk's stops; another tells whether
 * pins are on water (reroute). Queries are bounded by the stops, not the route's length, so a
 * 40 km walk costs no more than a short one.
 */
import type { LatLng } from '@qualk/shared';

import { requestJson, ServiceError, USER_AGENT, type Fetch } from '../net';

/** Public instances, tried in order. Configurable through OVERPASS_URLS. */
export const DEFAULT_OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Features are looked for within this distance of each stop. */
export const FEATURE_SEARCH_M = 90;
/** Documented places (Wikidata) within this distance can give a Local question. */
export const PLACE_SEARCH_M = 120;
/** A stop takes the name of a street within this distance. */
export const STREET_SEARCH_M = 35;

export interface OsmFeature {
  /** 'node/123', 'way/456', 'relation/789'. */
  id: string;
  name: string;
  location: LatLng;
  /** How good a stop name it is; 0 means not a landmark (only useful for its Wikidata id). */
  score: number;
  wikidata?: string;
  /** The OSM `wikipedia` tag, e.g. 'da:Marmorkirken'. */
  wikipedia?: string;
  /** Worth a Local question: not a shop, office, embassy, hotel or eatery. */
  notable: boolean;
}

export interface OsmStreet {
  name: string;
  points: LatLng[];
}

export interface OsmSurroundings {
  features: OsmFeature[];
  streets: OsmStreet[];
}

export interface Overpass {
  /** Runs a query and returns its elements. Throws ServiceError. */
  query(ql: string): Promise<OverpassElement[]>;
}

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

/** The longest a walk waits for Overpass before it carries on without names. */
export const OVERPASS_DEADLINE_MS = 25_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tries the servers in turn until one answers or the deadline passes. A busy server answers
 * 429 or 502 at once ("at capacity"), so those are retried after a short wait; a server that
 * doesn't answer is given up on for this query.
 */
export function overpassClient(
  urls: string[],
  fetchImpl?: Fetch,
  deadlineMs = OVERPASS_DEADLINE_MS,
): Overpass {
  return {
    async query(ql: string) {
      const until = Date.now() + deadlineMs;
      const dead = new Set<string>();
      let last: unknown;
      for (let attempt = 0; Date.now() < until; attempt++) {
        const live = urls.filter((u) => !dead.has(u));
        const url = live[attempt % Math.max(1, live.length)];
        if (!url) break;
        try {
          const res = await requestJson<{ elements?: OverpassElement[] }>(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': USER_AGENT,
                Accept: 'application/json',
              },
              body: new URLSearchParams({ data: ql }).toString(),
            },
            {
              service: 'overpass',
              timeoutMs: Math.max(1000, Math.min(15_000, until - Date.now())),
              fetch: fetchImpl,
            },
          );
          return res.elements ?? [];
        } catch (err) {
          last = err;
          const busy = err instanceof ServiceError && err.status !== undefined && err.transient;
          if (!busy) dead.add(url);
          else await sleep(Math.min(4000, 1000 * 2 ** Math.min(attempt, 2)));
        }
      }
      throw last instanceof ServiceError
        ? last
        : new ServiceError('overpass', String(last ?? 'no answer'));
    },
  };
}

const coord = (p: LatLng) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`;

/** Keys whose named features can be a stop's name; values are scored in `featureScore`. */
const FEATURE_KEYS = 'amenity|tourism|historic|leisure|man_made|natural|place|building';

/** The naming query for a walk's stops (and its start, so the title can name it). */
export function namingQuery(points: LatLng[]): string {
  const f = points
    .map(
      (p) =>
        `nwr(around:${FEATURE_SEARCH_M},${coord(p)})[name][~"^(${FEATURE_KEYS})$"~"."];` +
        `nwr(around:${PLACE_SEARCH_M},${coord(p)})[name][wikidata];`,
    )
    .join('');
  const s = points
    .map((p) => `way(around:${STREET_SEARCH_M},${coord(p)})[highway][name];`)
    .join('');
  return `[out:json][timeout:25];(${f})->.f;.f out tags center;(${s})->.s;.s out tags geom;`;
}

/** Scores for features by tag; the best name for a stop is the highest. */
const SCORES: [key: string, values: Record<string, number>, otherwise: number][] = [
  [
    'tourism',
    // Galleries are mostly shops; one with a Wikidata id still counts as a documented place.
    { artwork: 5, attraction: 5, museum: 4, viewpoint: 4, gallery: 0, theme_park: 3, zoo: 4 },
    0,
  ],
  [
    'historic',
    { monument: 5, castle: 5, memorial: 4, ruins: 4, fort: 4, ship: 4, manor: 4, church: 4 },
    3,
  ],
  [
    'amenity',
    {
      fountain: 5,
      place_of_worship: 5,
      townhall: 4,
      planetarium: 4,
      clock: 3,
      library: 3,
      theatre: 3,
      arts_centre: 3,
    },
    0,
  ],
  ['man_made', { lighthouse: 5, windmill: 5, obelisk: 4, tower: 3, water_tower: 3, bridge: 3 }, 0],
  [
    'building',
    {
      cathedral: 5,
      castle: 5,
      palace: 5,
      church: 4,
      chapel: 4,
      temple: 4,
      mosque: 4,
      synagogue: 4,
    },
    0,
  ],
  ['leisure', { playground: 4, park: 3, garden: 3, nature_reserve: 3 }, 0],
  ['place', { square: 4 }, 0],
  ['natural', { tree: 3, peak: 3, spring: 3, stone: 3, rock: 2 }, 0],
];

export function featureScore(tags: Record<string, string>): number {
  let best = 0;
  for (const [key, values, otherwise] of SCORES) {
    const v = tags[key];
    if (v === undefined) continue;
    best = Math.max(best, values[v] ?? otherwise);
  }
  // A documented feature is usually the one people know.
  return best > 0 && tags.wikidata ? best + 2 : best;
}

/** Documented but not something to quiz people about while standing outside it. */
const NOT_NOTABLE: Record<string, RegExp> = {
  shop: /./,
  office: /./,
  craft: /./,
  diplomatic: /./,
  healthcare: /./,
  tourism: /^(hotel|hostel|guest_house|apartment|motel)$/,
  amenity:
    /^(restaurant|cafe|bar|pub|fast_food|bank|pharmacy|clinic|doctors|dentist|embassy|parking|fuel|car_rental|post_office|police|school|kindergarten)$/,
};

export function isNotable(tags: Record<string, string>): boolean {
  if (featureScore(tags) > 0) return true;
  return !Object.entries(NOT_NOTABLE).some(([k, re]) => tags[k] !== undefined && re.test(tags[k]));
}

const nameOf = (tags: Record<string, string>) => (tags['name:en'] ?? tags.name ?? '').trim();

export function parseSurroundings(elements: OverpassElement[]): OsmSurroundings {
  const features = new Map<string, OsmFeature>();
  const streets = new Map<string, OsmStreet>();
  for (const e of elements) {
    const tags = e.tags ?? {};
    const name = nameOf(tags);
    if (!name) continue;
    if (e.geometry && tags.highway) {
      const key = `${e.type}/${e.id}`;
      streets.set(key, {
        name,
        points: e.geometry.map((g) => ({ latitude: g.lat, longitude: g.lon })),
      });
      continue;
    }
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const id = `${e.type}/${e.id}`;
    const wikidata = /^Q\d+$/.test(tags.wikidata ?? '') ? tags.wikidata : undefined;
    features.set(id, {
      id,
      name: name.length <= 80 ? name : name.slice(0, 80),
      location: { latitude: lat, longitude: lon },
      score: featureScore(tags),
      notable: isNotable(tags),
      ...(wikidata ? { wikidata } : {}),
      ...(tags.wikipedia ? { wikipedia: tags.wikipedia } : {}),
    });
  }
  return { features: [...features.values()], streets: [...streets.values()] };
}

export async function surroundings(overpass: Overpass, points: LatLng[]): Promise<OsmSurroundings> {
  return parseSurroundings(await overpass.query(namingQuery(points)));
}

// ------------------------------------------------------------------ water

const WATER =
  '(area.a[natural=water];area.a[water];area.a[waterway=riverbank];area.a[natural=bay];' +
  'area.a[natural=strait];area.a[place~"^(sea|ocean)$"];)';

/**
 * Which points are inside water. Each point gets a marker element, then the water areas it is
 * in, so the answer is read in order. `is_in` returns closed ways and areas from relations.
 * Open sea outside the coastline isn't a polygon in OSM, so a pin far out at sea is missed;
 * it is still marked "Off path".
 */
export function waterQuery(points: LatLng[]): string {
  const parts = points.map(
    (p, i) => `make pin idx="${i}";out;is_in(${coord(p)})->.a;${WATER};out tags;`,
  );
  return `[out:json][timeout:20];${parts.join('')}`;
}

export function parseWater(elements: OverpassElement[], count: number): boolean[] {
  const inWater = new Array<boolean>(count).fill(false);
  let current = -1;
  for (const e of elements) {
    if (e.type === 'pin') {
      current = Number(e.tags?.idx ?? -1);
    } else if (current >= 0 && current < count) {
      inWater[current] = true;
    }
  }
  return inWater;
}

export async function inWater(overpass: Overpass, points: LatLng[]): Promise<boolean[]> {
  if (points.length === 0) return [];
  return parseWater(await overpass.query(waterQuery(points)), points.length);
}
