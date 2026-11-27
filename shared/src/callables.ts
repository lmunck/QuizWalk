/**
 * Request and response types for every callable Cloud Function (spec §8), so the app and the
 * functions are built against one contract. docs/m4-generation-design.md §11 explains each one.
 *
 * Errors arrive as Firebase `HttpsError`s: `code` is the callable error code, `message` can be
 * shown as it is, and `details` is a `CallableErrorDetails`.
 */
import type { CategoryId } from './categories';
import type { WalkProblem } from './problems';
import type { SpacedStop, ViewDiamond } from './route';
import type { Difficulty, LatLng, StopWarning, WalkOpenFor, WalkRoute } from './types';

/** Why a call was refused, when the app has to do more than show the message. */
export type CallableErrorReason =
  /** routeForView: the walking route is shorter than N × 150 m. Keep the previous route. */
  | 'tooShort'
  /** routeForView: no walkable path near the start, or anywhere in the view. */
  | 'unroutable'
  /** routeForView: the view is larger than the routing service allows. */
  | 'tooBig'
  /** A routing, map or writing service failed or timed out. Try again. */
  | 'unavailable'
  /** Too many calls of this kind; `retryAfterS` says when the next one is allowed. */
  | 'rateLimited'
  /** generateWalk: the bank has no questions for this walk yet. */
  | 'noQuestions';

export interface CallableErrorDetails {
  reason?: CallableErrorReason;
  /** publishWalk, openWalk: everything that blocks, for C4's and C6's lists. */
  problems?: WalkProblem[];
  /** `tooShort`: the shortest loop that fits the stops, and the route's actual length. */
  minLengthM?: number;
  distanceM?: number;
  /** `rateLimited`: seconds until the next call is allowed. */
  retryAfterS?: number;
}

/** About 30 Refreshes per creator per hour, 20 generations per day (spec §8). */
export const RATE_LIMITS = {
  routeForView: { max: 30, windowS: 3600 },
  generateWalk: { max: 20, windowS: 86_400 },
  swapQuestion: { max: 120, windowS: 3600 },
  reroute: { max: 60, windowS: 3600 },
} as const;

export type RateLimitedCallable = keyof typeof RATE_LIMITS;

// ------------------------------------------------------------------ M1 and M2

export interface WalkIdRequest {
  walkId: string;
}

export type PublishWalkRequest = WalkIdRequest;
export interface PublishWalkResponse {
  joinCode: string;
}

export interface OpenWalkRequest {
  walkId: string;
  openFor: WalkOpenFor;
}
export interface OpenWalkResponse {
  openedAtMs: number;
  openFor: WalkOpenFor;
}

export type DeleteWalkRequest = WalkIdRequest;
export interface DeleteWalkResponse {
  ok: true;
}

export type DuplicateWalkRequest = WalkIdRequest;
export interface DuplicateWalkResponse {
  walkId: string;
}

// ------------------------------------------------------------------ routeForView (C2 Refresh)

/**
 * C2's *Refresh*. The phone takes `viewScreenPoints(frame)` and turns every point into a
 * coordinate with `coordinateForPoint`. It checks `refreshCheck(view, questionCount)` first and
 * only calls when that passes. Writes nothing.
 */
export interface RouteForViewRequest {
  /** The four points: the Start pin at the bottom, the sides and the top. */
  view: ViewDiamond<LatLng>;
  /** The usable map area's four corners, unshrunk, in any order around the edge. */
  corners: LatLng[];
  /** 4–12. */
  questionCount: number;
  /**
   * 0 for the first Refresh on a view. Add 1 for each Refresh while the view and the question
   * count stay the same, and go back to 0 when either changes: a variant moves the three far
   * points a little, so the same view gives a different route.
   */
  variant?: number;
}

export interface RouteForViewResponse {
  /** The whole loop. `route.key` is unset: generateWalk sets it once the stops are placed. */
  route: WalkRoute;
  /** Where the loop starts and ends: the Start pin moved onto the nearest path. */
  start: LatLng;
  /** `questionCount` stops spaced along the route; the last is back at `start`. */
  stops: SpacedStop[];
  /** False when even a shrunk loop leaves the view; the app may zoom out to show it. */
  fitsView: boolean;
}

// ------------------------------------------------------------------ generateWalk (C2 Next)

/**
 * C2's *Next*, and C4's *New route* after C2 again. Before calling, the app writes onto its
 * draft (or ready) walk: `route` from routeForView, `categories` (empty = Auto), `difficulty`,
 * and `start`. The stops are placed with `spaceStops(decodePolyline(route.polyline), N)`, as
 * routeForView placed them.
 *
 * Progress is in `generationJobs/{walkId}`: subscribe to it before calling (the document may
 * not exist yet). The call returns once the walk is written; if the app leaves C3, the work
 * carries on and the job document records the outcome.
 *
 * On a walk that already has stops (New route), trivia questions and the creator's own
 * questions are kept in their order, and Local questions are picked again for the new places.
 */
export interface GenerateWalkRequest {
  walkId: string;
  /** 4–12, the same number routeForView spaced the stops for. */
  questionCount: number;
}

export interface GenerateWalkResponse {
  jobId: string;
  title: string;
  stopCount: number;
  /** How many stops have a Local question. */
  localCount: number;
}

export type GenerationStep = 'naming' | 'picking' | 'writing';

/** C3's step labels (spec §3 C3). */
export const GENERATION_STEP_LABELS: Record<GenerationStep, string> = {
  naming: 'Naming stops',
  picking: 'Picking questions',
  writing: 'Writing local questions',
};

/** A running job whose `updatedAt` is older than this has failed (the function timed out). */
export const GENERATION_STALE_MS = 6 * 60 * 1000;

// ------------------------------------------------------------------ swapQuestion (C5, G2)

/**
 * C5's *Swap* and G2's *Suggest a question*: a proposal the creator accepts or discards. It is
 * never written by the function. To accept, the app writes the proposal's fields onto the stop
 * (`question`, `options`, `correctIndex`, `explanation`, `source`, `bankQuestionId`, `origin`,
 * and adds `warnings`). When the creator edits the text or answers of a stop that has a
 * `bankQuestionId`, the app deletes `bankQuestionId` in the same write.
 */
export interface SwapQuestionRequest {
  walkId: string;
  /** The stop whose question is swapped. Leave out for a stop not saved yet (G2). */
  stopId?: string;
  /** G2: where the new stop is, so a Local question can be found for a documented place. */
  location?: LatLng;
  /** Bank question ids already offered in this sheet, so Swap doesn't offer them again. */
  exclude?: string[];
}

export interface ProposedQuestion {
  bankQuestionId: string;
  kind: 'trivia' | 'place';
  category: CategoryId;
  difficulty: Difficulty;
  question: string;
  /** Already shuffled. */
  options: string[];
  correctIndex: number;
  explanation: string;
  source?: { title: string; url: string };
  origin: 'ai';
  /** `['unverified']` for a Local question, so C4 asks the creator to check it. */
  warnings: StopWarning[];
  /** Local questions: the place's name, which G2 can offer as the stop's name. */
  placeName?: string;
}

export interface SwapQuestionResponse {
  /** Null when the bank has nothing more to offer for this stop. */
  proposal: ProposedQuestion | null;
}

// ------------------------------------------------------------------ reroute (C4 save)

/**
 * After C4 saves a change to the stops. Routes Start → stop 1 → … → last stop along walkable
 * paths and writes `route` and `distanceM` on the walk and `warnings` on each stop
 * (`offPath`, `onWater`; `unverified` is left as it was). Pins are not moved. Draft or ready
 * walks only.
 */
export type RerouteRequest = WalkIdRequest;

export interface RerouteStop {
  stopId: string;
  /** Metres from the pin to the nearest walkable path, or null when none is within 350 m. */
  offsetM: number | null;
  warnings: StopWarning[];
}

export interface RerouteResponse {
  /** Null for a walk with no stops. `route.key` matches the stops it was made for. */
  route: WalkRoute | null;
  /** Start → last stop along the route, as written to the walk. */
  distanceM: number;
  stops: RerouteStop[];
}
