/**
 * Firestore data model, from docs/v1-spec.md §6.
 *
 * Timestamps and locations use small structural types so this package does not depend on
 * either Firebase SDK. Both the Admin SDK and React Native Firebase types satisfy them.
 */

import type { GenerationStep } from './callables';
import type { CategoryId } from './categories';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Any Firestore Timestamp (Admin SDK or React Native Firebase). */
export interface TimestampLike {
  toMillis(): number;
}

export type WalkStatus = 'draft' | 'ready' | 'open' | 'ended';
/** How long a walk stays open, chosen on Open walk: 12 hours or 7 days. */
export type WalkOpenFor = 'day' | 'week';
export type Difficulty = 'kids' | 'mixed' | 'expert';
export type WalkShape = 'loop' | 'oneway';
export type PlayMode = 'solo' | 'team';
export type StopWarning = 'onWater' | 'offPath' | 'unverified';
export type AnswerKind = 'answered' | 'imHere' | 'skipped';

/** users/{uid}. A participant's doc holds only `playing`; creators add the rest on sign-in. */
export interface UserDoc {
  /** The creator's name as players see it ("Waiting for Anders"). Asked for at first sign-in. */
  displayName?: string;
  createdAt?: TimestampLike;
  pushToken?: string;
  /** Walks joined on this phone, for Home's Playing section. Not a history. */
  playing?: string[];
}

/** joinCodes/{code} */
export interface JoinCodeDoc {
  walkId: string;
  createdAt: TimestampLike;
}

export interface WalkRoute {
  /** Encoded polyline from OpenRouteService (precision 5; `decodePolyline`). */
  polyline: string;
  distanceM: number;
  durationS: number;
  /**
   * `routeKey(start, stops)` of the pins the route was made for. While it matches, the walk's
   * distance is the routed one; after an edit it is straight lines until `reroute` runs.
   */
  key?: string;
}

/** walks/{walkId} */
export interface WalkDoc {
  ownerUid: string;
  ownerName: string;
  title: string;
  /** Generated walks: the chosen categories. Missing or empty means Auto. */
  categories?: CategoryId[];
  difficulty?: Difficulty;
  status: WalkStatus;
  joinCode?: string;
  modes: { solo: boolean; team: boolean };
  maxPlayers: number;
  whenText?: string;
  start: LatLng;
  startLabel: string;
  shape: WalkShape;
  route: WalkRoute | null;
  stopCount: number;
  /**
   * Start → stop 1 → … → last stop, in metres: the routed distance when `route` exists,
   * otherwise straight lines (`walkDistanceM`). Kept on the walk so P1 can show it before joining.
   */
  distanceM: number;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  /** Set together with `openedAt`. Missing means `day`. */
  openFor?: WalkOpenFor;
  openedAt?: TimestampLike;
  endedAt?: TimestampLike;
}

/** walks/{walkId}/stops/{stopId} */
export interface StopDoc {
  order: number;
  location: LatLng;
  placeName: string;
  radiusM: StopRadius;
  question: string;
  /** 2 to 4 options. */
  options: string[];
  correctIndex: number;
  explanation: string;
  hint?: string;
  source?: { title: string; url: string };
  origin: 'ai' | 'manual';
  /** The question came from the bank (spec §8). Its text is still copied onto the stop. */
  bankQuestionId?: string;
  warnings: StopWarning[];
  skippedForAll: boolean;
}

/** walks/{walkId}/teams/{uid}. The team id is the participant's uid (one phone per team). */
export interface TeamDoc {
  name: string;
  mode: PlayMode;
  players: number;
  /** Index into the team colours, picked at join as the least used so far. Never changes. */
  colorIndex: number;
  pushToken?: string;
  joinedAt: TimestampLike;
  /** Set once by the app on Start walk. */
  startedAt?: TimestampLike;
  /** Set by the app on Leave walk after starting; cleared if the team resumes. */
  leftAt?: TimestampLike;
  finishedAt?: TimestampLike;
  lastSeenAt: TimestampLike;
  /** Written by the app. */
  distanceWalkedM: number;
  /** Written by Cloud Functions only. */
  score: number;
  correctCount: number;
  stopsDone: number;
}

/** walks/{walkId}/teams/{uid}/answers/{stopId}. One answer per stop. */
export interface AnswerDoc {
  kind: AnswerKind;
  choiceIndex?: number;
  openedAtClient: TimestampLike;
  answeredAtClient: TimestampLike;
  elapsedMs: number;
  /** Written by Cloud Functions only. */
  points?: number;
  correct?: boolean;
}

/** walks/{walkId}/positions/{uid}. Last known position only, overwritten. */
export interface PositionDoc {
  location: LatLng;
  accuracyM: number;
  at: TimestampLike;
}

/** walks/{walkId}/alerts/{alertId} */
export interface AlertDoc {
  teamUid: string;
  stopId: string;
  kind: 'blocked';
  createdAt: TimestampLike;
  resolved: boolean;
}

/**
 * generationJobs/{jobId}. The job id is the walk id, so C3 and Home can find a walk's job
 * without being told. Written by generateWalk only.
 */
export interface GenerationJobDoc {
  ownerUid: string;
  walkId: string;
  status: 'running' | 'done' | 'failed';
  /** The steps C3 shows. `writing` is added only when a Local stop's place is new. */
  steps: GenerationStep[];
  /** 0 before the first step; then 1-based, the step running now. Equal to steps.length when done. */
  step: number;
  /** One line per finished step: "8 stops named", "8 questions picked". */
  stepDetail: string[];
  /**
   * Not written: C3 must not show question text, so *Play it myself* has no spoilers. Kept in
   * the type because the spec's data model lists it.
   */
  latestQuestion?: string;
  /** Set when `status` is `failed`: a sentence C3 can show. */
  error?: string;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
}

export const STOP_RADII_M = [25, 40, 60] as const;
export type StopRadius = (typeof STOP_RADII_M)[number];
export const DEFAULT_STOP_RADIUS_M: StopRadius = 40;
