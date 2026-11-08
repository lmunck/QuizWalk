/**
 * Firestore data model, from docs/v1-spec.md §6.
 *
 * Timestamps and locations use small structural types so this package does not depend on
 * either Firebase SDK. Both the Admin SDK and React Native Firebase types satisfy them.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Any Firestore Timestamp (Admin SDK or React Native Firebase). */
export interface TimestampLike {
  toMillis(): number;
}

export type WalkStatus = 'draft' | 'ready' | 'open' | 'ended';
export type Difficulty = 'kids' | 'mixed' | 'expert';
export type WalkShape = 'loop' | 'oneway';
export type PlayMode = 'solo' | 'team';
export type StopWarning = 'onWater' | 'offPath' | 'unverified';
export type AnswerKind = 'answered' | 'imHere' | 'skipped';

/** users/{uid} */
export interface UserDoc {
  displayName: string;
  createdAt: TimestampLike;
  pushToken?: string;
}

/** joinCodes/{code} */
export interface JoinCodeDoc {
  walkId: string;
  createdAt: TimestampLike;
}

export interface WalkRoute {
  /** Encoded polyline from OpenRouteService. */
  polyline: string;
  distanceM: number;
  durationS: number;
}

/** walks/{walkId} */
export interface WalkDoc {
  ownerUid: string;
  ownerName: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
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
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
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
  warnings: StopWarning[];
  skippedForAll: boolean;
}

/** walks/{walkId}/teams/{uid}. The team id is the participant's uid (one phone per team). */
export interface TeamDoc {
  name: string;
  mode: PlayMode;
  players: number;
  pushToken?: string;
  joinedAt: TimestampLike;
  startedAt?: TimestampLike;
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

/** generationJobs/{jobId} */
export interface GenerationJobDoc {
  ownerUid: string;
  walkId: string;
  status: 'running' | 'done' | 'failed';
  step: 0 | 1 | 2 | 3 | 4;
  stepDetail: string[];
  latestQuestion?: string;
  error?: string;
}

export const STOP_RADII_M = [25, 40, 60] as const;
export type StopRadius = (typeof STOP_RADII_M)[number];
export const DEFAULT_STOP_RADIUS_M: StopRadius = 40;
