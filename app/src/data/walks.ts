/** walks/{walkId} and walks/{walkId}/stops (spec §6). */
import {
  DEFAULT_STOP_RADIUS_M,
  walkDistanceM,
  type LatLng,
  type StopDoc,
  type WalkDoc,
} from '@qualk/shared';
import {
  collection,
  deleteDoc,
  doc,
  GeoPoint,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

import { failed } from './errors';
import { db } from './firebase';
import { fromFirestore, readDoc, useLiveDoc, useLiveQuery, type Live, type WithId } from './hooks';

export type Walk = WithId<WalkDoc>;
export type Stop = WithId<StopDoc>;

const geo = (p: LatLng) => new GeoPoint(p.latitude, p.longitude);
const walkRef = (walkId: string) => doc(db, 'walks', walkId);
const stopsCol = (walkId: string) => collection(db, 'walks', walkId, 'stops');

// ------------------------------------------------------------------ reads

export function useWalk(walkId: string | undefined): Live<Walk | undefined> {
  return useLiveDoc<WalkDoc>(walkId ? `walks/${walkId}` : null, () => walkRef(walkId!));
}

/** The creator's own walks, newest edit first (index: ownerUid + updatedAt). */
export function useMyWalks(uid: string | undefined, enabled: boolean): Live<Walk[]> {
  return useLiveQuery<WalkDoc>(enabled && uid ? `myWalks/${uid}` : null, () =>
    query(collection(db, 'walks'), where('ownerUid', '==', uid), orderBy('updatedAt', 'desc')),
  );
}

/** Several walks by id, live (Home's Playing section). Missing or unreadable ones are left out. */
export function useWalksById(ids: string[]): Live<Walk[]> {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; data: Walk[] }>({ key: '', data: [] });

  useEffect(() => {
    if (ids.length === 0) return;
    const found = new Map<string, Walk | null>();
    const publish = () => {
      if (found.size < ids.length) return;
      setState({ key, data: ids.map((id) => found.get(id)).filter((w): w is Walk => !!w) });
    };
    const unsubs = ids.map((id) =>
      onSnapshot(
        walkRef(id),
        (snap) => {
          found.set(id, readDoc<WalkDoc>(snap) ?? null);
          publish();
        },
        () => {
          found.set(id, null);
          publish();
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (ids.length === 0) return { data: [], loading: false };
  return state.key === key ? { data: state.data, loading: false } : { data: [], loading: true };
}

/** Stops in play order. */
export function useStops(walkId: string | undefined): Live<Stop[]> {
  return useLiveQuery<StopDoc>(walkId ? `stops/${walkId}` : null, () =>
    query(stopsCol(walkId!), orderBy('order', 'asc')),
  );
}

// ------------------------------------------------------------------ writes (owner)

/** Straight-line totals the walk doc carries so P1 can show them before joining. */
function totalsFor(start: LatLng, stopsInOrder: { location: LatLng }[]) {
  return {
    stopCount: stopsInOrder.length,
    distanceM: Math.round(
      walkDistanceM(
        start,
        stopsInOrder.map((s) => s.location),
      ),
    ),
    updatedAt: serverTimestamp(),
  };
}

/** C2 "Build it myself": a draft with a title and a Start pin. Returns the new id at once. */
export function createDraft(input: {
  uid: string;
  ownerName: string;
  title: string;
  start: LatLng;
  startLabel: string;
}): string {
  const ref = doc(collection(db, 'walks'));
  const batch = writeBatch(db);
  batch.set(ref, {
    ownerUid: input.uid,
    ownerName: input.ownerName,
    title: input.title.trim(),
    status: 'draft',
    modes: { solo: true, team: true },
    maxPlayers: 6,
    start: geo(input.start),
    startLabel: input.startLabel,
    shape: 'oneway',
    route: null,
    stopCount: 0,
    distanceM: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.commit().catch(failed('Could not create the walk'));
  return ref.id;
}

type WalkEdit = Partial<
  Pick<WalkDoc, 'title' | 'ownerName' | 'modes' | 'maxPlayers' | 'whenText' | 'startLabel'>
>;

export function updateWalk(walkId: string, fields: WalkEdit): void {
  updateDoc(walkRef(walkId), { ...fields, updatedAt: serverTimestamp() }).catch(
    failed('Could not save the walk'),
  );
}

export function moveStart(walk: Walk, stops: Stop[], start: LatLng, startLabel?: string): void {
  updateDoc(walkRef(walk.id), {
    start: geo(start),
    ...(startLabel !== undefined ? { startLabel } : {}),
    ...totalsFor(start, stops),
  }).catch(failed('Could not move the start'));
}

/**
 * Adds a stop. With `insertAt` it goes into that position and later stops move down (G2:
 * "between 5 and 6"); without it, it goes last. Returns the new stop's id.
 */
export function addStop(
  walk: Walk,
  stops: Stop[],
  input: { location: LatLng; placeName: string; insertAt?: number },
): string {
  const at = Math.max(0, Math.min(input.insertAt ?? stops.length, stops.length));
  const ref = doc(stopsCol(walk.id));
  const stop: StopDoc = {
    order: at,
    location: input.location,
    placeName: input.placeName,
    radiusM: DEFAULT_STOP_RADIUS_M,
    question: '',
    options: ['', ''],
    correctIndex: 0,
    explanation: '',
    origin: 'manual',
    warnings: [],
    skippedForAll: false,
  };
  const batch = writeBatch(db);
  batch.set(ref, { ...stop, location: geo(input.location) });
  const next = [...stops];
  next.splice(at, 0, { ...stop, id: ref.id });
  next.forEach((s, i) => {
    if (s.id !== ref.id && s.order !== i) batch.update(doc(stopsCol(walk.id), s.id), { order: i });
  });
  batch.update(walkRef(walk.id), totalsFor(walk.start, next));
  batch.commit().catch(failed('Could not add the stop'));
  return ref.id;
}

type StopEdit = Partial<
  Pick<
    StopDoc,
    'placeName' | 'radiusM' | 'question' | 'options' | 'correctIndex' | 'explanation' | 'hint'
  >
> & { location?: LatLng };

export function updateStop(walk: Walk, stops: Stop[], stopId: string, fields: StopEdit): void {
  const batch = writeBatch(db);
  const { location, ...rest } = fields;
  batch.update(doc(stopsCol(walk.id), stopId), {
    ...rest,
    ...(location ? { location: geo(location) } : {}),
  });
  const next = stops.map((s) => (s.id === stopId && location ? { ...s, location } : s));
  batch.update(walkRef(walk.id), totalsFor(walk.start, next));
  batch.commit().catch(failed('Could not save the stop'));
}

/** Sets every stop's `order` from the given sequence (drag reorder, Move up/down). */
export function reorderStops(walk: Walk, inNewOrder: Stop[]): void {
  const batch = writeBatch(db);
  inNewOrder.forEach((s, i) => {
    if (s.order !== i) batch.update(doc(stopsCol(walk.id), s.id), { order: i });
  });
  batch.update(walkRef(walk.id), totalsFor(walk.start, inNewOrder));
  batch.commit().catch(failed('Could not reorder the stops'));
}

export function deleteStop(walk: Walk, stops: Stop[], stopId: string): void {
  const batch = writeBatch(db);
  batch.delete(doc(stopsCol(walk.id), stopId));
  const rest = stops.filter((s) => s.id !== stopId);
  rest.forEach((s, i) => {
    if (s.order !== i) batch.update(doc(stopsCol(walk.id), s.id), { order: i });
  });
  batch.update(walkRef(walk.id), totalsFor(walk.start, rest));
  batch.commit().catch(failed('Could not delete the stop'));
}

/** A draft can be deleted by its owner directly; anything published goes through deleteWalk. */
export async function deleteDraft(walkId: string, stops: Stop[]): Promise<void> {
  const batch = writeBatch(db);
  stops.forEach((s) => batch.delete(doc(stopsCol(walkId), s.id)));
  await batch.commit();
  await deleteDoc(walkRef(walkId));
}

/** The owner's one status write: open → ended. Ranks are derived, nothing is frozen. */
export async function endWalk(walkId: string): Promise<void> {
  await updateDoc(walkRef(walkId), {
    status: 'ended',
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Skip for everyone (M2). onStopUpdated recalculates every team. */
export function skipStopForEveryone(walkId: string, stopId: string): void {
  updateDoc(doc(stopsCol(walkId), stopId), { skippedForAll: true }).catch(
    failed('Could not skip the stop'),
  );
}

/** One read of a walk (join flow). */
export async function readWalk(walkId: string): Promise<Walk | undefined> {
  const snap = await getDoc(walkRef(walkId));
  return snap.exists()
    ? ({ id: snap.id, ...(fromFirestore(snap.data()) as WalkDoc) } as Walk)
    : undefined;
}
