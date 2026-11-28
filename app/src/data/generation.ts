/**
 * Generated walks (spec §3 C2–C4, m4-generation-design §11): the draft that C2's Next writes,
 * the generationJobs document that drives C3, and the one generateWalk call per walk.
 */
import {
  GENERATION_STALE_MS,
  type CategoryId,
  type Difficulty,
  type GenerationJobDoc,
  type LatLng,
  type WalkRoute,
} from '@qualk/shared';
import {
  collection,
  doc,
  GeoPoint,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';

import { generateWalk } from './callables';
import { db } from './firebase';
import { useLiveDoc, useLiveQuery, type Live, type WithId } from './hooks';

export type GenerationJob = WithId<GenerationJobDoc>;

const geo = (p: LatLng) => new GeoPoint(p.latitude, p.longitude);

/** The quiz and the route that C2's Next writes onto the walk before generateWalk runs. */
export interface GeneratedRoute {
  route: WalkRoute;
  start: LatLng;
  startLabel: string;
  categories: CategoryId[];
  difficulty: Difficulty;
}

function routeFields(r: GeneratedRoute) {
  return {
    route: {
      polyline: r.route.polyline,
      distanceM: Math.round(r.route.distanceM),
      durationS: Math.round(r.route.durationS),
    },
    start: geo(r.start),
    startLabel: r.startLabel.slice(0, 80),
    categories: r.categories,
    difficulty: r.difficulty,
    shape: 'loop' as const,
    updatedAt: serverTimestamp(),
  };
}

/**
 * C2's Next on a new walk. Awaited, unlike the editor's writes: generateWalk reads the walk on
 * the server, and generating needs a connection anyway. The title is a placeholder the rules
 * need; generateWalk replaces it.
 */
export async function createGeneratedDraft(
  input: GeneratedRoute & { uid: string; ownerName: string },
): Promise<string> {
  const ref = doc(collection(db, 'walks'));
  await setDoc(ref, {
    ownerUid: input.uid,
    ownerName: input.ownerName,
    title: 'Quiz walk',
    status: 'draft',
    modes: { solo: true, team: true },
    maxPlayers: 6,
    stopCount: 0,
    distanceM: Math.round(input.route.distanceM),
    createdAt: serverTimestamp(),
    ...routeFields(input),
  });
  return ref.id;
}

/** C4's New route, after C2 again: the walk's route and quiz choices; generateWalk does the rest. */
export async function setNewRoute(walkId: string, input: GeneratedRoute): Promise<void> {
  await updateDoc(doc(db, 'walks', walkId), routeFields(input));
}

export function useGenerationJob(walkId: string | undefined): Live<GenerationJob | undefined> {
  return useLiveDoc<GenerationJobDoc>(walkId ? `generationJobs/${walkId}` : null, () =>
    doc(db, 'generationJobs', walkId!),
  );
}

/** Home's "Generating…": the creator's jobs still running. */
export function useRunningJobs(uid: string | undefined, enabled: boolean): Live<GenerationJob[]> {
  return useLiveQuery<GenerationJobDoc>(enabled && uid ? `runningJobs/${uid}` : null, () =>
    query(
      collection(db, 'generationJobs'),
      where('ownerUid', '==', uid),
      where('status', '==', 'running'),
    ),
  );
}

/** A job still `running` long after its last update has failed: the function timed out. */
export function isStale(job: GenerationJobDoc, nowMs: number): boolean {
  return job.status === 'running' && nowMs - job.updatedAt.toMillis() > GENERATION_STALE_MS;
}

// ------------------------------------------------------------------ the call

/** This phone's generateWalk call for a walk: in flight, or the error of the last one. */
export interface GenerationRun {
  inFlight: boolean;
  error?: unknown;
}

const IDLE: GenerationRun = { inFlight: false };
const runs = new Map<string, GenerationRun>();
const listeners = new Set<() => void>();

function setRun(walkId: string, run: GenerationRun | undefined) {
  if (run) runs.set(walkId, run);
  else runs.delete(walkId);
  listeners.forEach((l) => l());
}

/**
 * Starts generateWalk for a walk, once. Leaving C3 doesn't cancel it: the work carries on on
 * the server and the job records the outcome (spec §3 C3).
 */
export function startGeneration(walkId: string, questionCount: number): void {
  if (runs.get(walkId)?.inFlight) return;
  setRun(walkId, { inFlight: true });
  generateWalk({ walkId, questionCount }).then(
    () => setRun(walkId, undefined),
    (error: unknown) => setRun(walkId, { inFlight: false, error }),
  );
}

/** A stable snapshot, for useSyncExternalStore. */
export function generationRun(walkId: string): GenerationRun {
  return runs.get(walkId) ?? IDLE;
}

export function onGenerationRunChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
