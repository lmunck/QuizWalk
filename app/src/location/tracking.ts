/**
 * While a team is walking: distance walked and the last-known position for the creator's map
 * (§9 Uploads). Nothing is uploaded before Start walk or after finishing or leaving.
 */
import {
  countsTowardsDistance,
  distanceM,
  POSITION_UPLOAD_MIN_MOVE_M,
  shouldUploadPosition,
} from '@qualk/shared';
import { useEffect, useRef } from 'react';

import { reportDistance, uploadPosition } from '@/data/teams';

import { subscribeToPosition, type Fix } from './position';

/** distanceWalkedM is written at most this often. */
const DISTANCE_WRITE_MS = 60_000;

export function useWalkTracking(opts: {
  walkId: string | undefined;
  uid: string | undefined;
  active: boolean;
  startDistanceM: number;
}): void {
  const { walkId, uid, active } = opts;
  const startDistance = useRef(opts.startDistanceM);
  useEffect(() => {
    startDistance.current = Math.max(startDistance.current, opts.startDistanceM);
  }, [opts.startDistanceM]);

  useEffect(() => {
    if (!active || !walkId || !uid) return;
    let walked = startDistance.current;
    let lastCounted: Fix | undefined;
    let lastUpload: { fix: Fix; atMs: number } | undefined;
    let lastDistanceWrite = Date.now();
    let dirty = false;

    const unsubscribe = subscribeToPosition((fix) => {
      const now = Date.now();
      if (lastCounted) {
        const seg = distanceM(lastCounted, fix);
        if (countsTowardsDistance(seg, fix.accuracyM)) {
          walked += seg;
          lastCounted = fix;
          dirty = true;
        }
      } else if (fix.accuracyM <= 30) {
        lastCounted = fix;
      }

      const moved = lastUpload ? distanceM(lastUpload.fix, fix) : POSITION_UPLOAD_MIN_MOVE_M;
      const since = lastUpload ? now - lastUpload.atMs : Number.POSITIVE_INFINITY;
      if (shouldUploadPosition(since, moved)) {
        uploadPosition(walkId, uid, fix, fix.accuracyM);
        lastUpload = { fix, atMs: now };
      }

      if (dirty && now - lastDistanceWrite >= DISTANCE_WRITE_MS) {
        reportDistance(walkId, uid, walked);
        lastDistanceWrite = now;
        dirty = false;
      }
    });

    return () => {
      unsubscribe();
      if (dirty) reportDistance(walkId, uid, walked);
      startDistance.current = walked;
    };
  }, [active, walkId, uid]);
}
