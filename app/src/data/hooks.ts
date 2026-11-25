/**
 * Live Firestore reads as hooks. They return `{ data, loading, error }` and nothing else
 * (m1-design §4). The native SDK is the cache; there is no second one.
 */
import {
  GeoPoint,
  onSnapshot,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
} from '@react-native-firebase/firestore';
import { useEffect, useState } from 'react';

export type WithId<T> = T & { id: string };

export interface Live<T> {
  data: T;
  loading: boolean;
  error?: Error;
  /** True when the snapshot came from the offline cache (the leaderboard says so). */
  fromCache?: boolean;
}

/** Pending server timestamps read as the local estimate instead of null. */
const SNAPSHOT_OPTIONS = { serverTimestamps: 'estimate' } as const;

/**
 * The converter (m1-design §4): GeoPoints become plain `{ latitude, longitude }` objects.
 * GeoPoint keeps its coordinates in getters, which a spread or a native map view never sees.
 * Timestamps stay as they are; they already satisfy TimestampLike.
 */
export function fromFirestore(value: unknown): unknown {
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (value instanceof Timestamp || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(fromFirestore);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = fromFirestore(v);
  return out;
}

export function readDoc<T>(snap: DocumentSnapshot<DocumentData>): WithId<T> | undefined {
  if (!snap.exists()) return undefined;
  return { id: snap.id, ...(fromFirestore(snap.data(SNAPSHOT_OPTIONS)) as T) };
}

interface Snapshot<T> {
  /** The subscription this state belongs to; a different key means it is still loading. */
  key: string | null;
  data: T;
  error?: Error;
  fromCache?: boolean;
  pendingWrites?: number;
}

/** A live document. `key` must change whenever `makeRef` would build a different ref. */
export function useLiveDoc<T>(
  key: string | null,
  makeRef: () => DocumentReference<DocumentData>,
): Live<WithId<T> | undefined> {
  const [state, setState] = useState<Snapshot<WithId<T> | undefined>>({
    key: null,
    data: undefined,
  });

  useEffect(() => {
    if (key === null) return;
    return onSnapshot(
      makeRef(),
      { includeMetadataChanges: false },
      (snap) => setState({ key, data: readDoc<T>(snap), fromCache: snap.metadata.fromCache }),
      (error) => setState({ key, data: undefined, error }),
    );
    // makeRef is rebuilt every render; key says when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = key !== null && state.key === key;
  return {
    data: current ? state.data : undefined,
    loading: key !== null && !current,
    error: current ? state.error : undefined,
    fromCache: current ? state.fromCache : undefined,
  };
}

/** A live query. `key` must change whenever `makeQuery` would build a different query. */
export function useLiveQuery<T>(
  key: string | null,
  makeQuery: () => Query<DocumentData>,
  options: { includeMetadataChanges?: boolean } = {},
): Live<WithId<T>[]> & { pendingWrites?: number } {
  const [state, setState] = useState<Snapshot<WithId<T>[]>>({ key: null, data: [] });
  const includeMetadataChanges = options.includeMetadataChanges === true;

  useEffect(() => {
    if (key === null) return;
    return onSnapshot(
      makeQuery(),
      { includeMetadataChanges },
      (snap) =>
        setState({
          key,
          data: snap.docs.map((d) => ({
            id: d.id,
            ...(fromFirestore(d.data(SNAPSHOT_OPTIONS)) as T),
          })),
          fromCache: snap.metadata.fromCache,
          pendingWrites: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
        }),
      (error) => setState({ key, data: [], error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, includeMetadataChanges]);

  const current = key !== null && state.key === key;
  return {
    data: current ? state.data : EMPTY,
    loading: key !== null && !current,
    error: current ? state.error : undefined,
    fromCache: current ? state.fromCache : undefined,
    pendingWrites: current ? state.pendingWrites : undefined,
  };
}

const EMPTY: never[] = [];
