/**
 * Per-creator limits on the callables that spend routing calls or tokens (spec §8). A sliding
 * window kept in rateLimits/{uid}, which no client can read or write.
 */
import { RATE_LIMITS, type RateLimitedCallable } from '@qualk/shared';
import type { Firestore } from 'firebase-admin/firestore';

import { QualkError } from './errors';

function waitText(seconds: number): string {
  if (seconds < 90) return 'in a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `in ${minutes} minutes`;
  return `in ${Math.ceil(minutes / 60)} hours`;
}

const WHAT: Record<RateLimitedCallable, string> = {
  routeForView: 'That’s a lot of refreshing.',
  generateWalk: 'That’s a lot of walks for one day.',
  swapQuestion: 'That’s a lot of swapping.',
  reroute: 'That’s a lot of route changes.',
};

/** Counts one call, or refuses it with `resource-exhausted` and when to try again. */
export async function checkRateLimit(
  db: Firestore,
  uid: string,
  name: RateLimitedCallable,
  nowMs = Date.now(),
): Promise<void> {
  const { max, windowS } = RATE_LIMITS[name];
  const ref = db.doc(`rateLimits/${uid}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recent = ((snap.get(name) as number[] | undefined) ?? []).filter(
      (t) => typeof t === 'number' && t > nowMs - windowS * 1000,
    );
    if (recent.length >= max) {
      const retryAfterS = Math.max(
        1,
        Math.ceil((Math.min(...recent) + windowS * 1000 - nowMs) / 1000),
      );
      throw new QualkError(
        'resource-exhausted',
        `${WHAT[name]} Try again ${waitText(retryAfterS)}.`,
        { reason: 'rateLimited', retryAfterS },
      );
    }
    tx.set(ref, { [name]: [...recent, nowMs] }, { merge: true });
  });
}
