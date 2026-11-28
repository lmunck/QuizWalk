/**
 * Reroute on save in C4 (spec §3 C4, §8 `reroute`). The editor writes each change at once and
 * offline-first, so "save" is the moment the pins settle: about two seconds after the last
 * change to the Start pin, a stop's pin, or the order, and at once on Publish or on leaving C4.
 * A burst of drags makes one call, never one per drag. `reroute` writes the route, its distance
 * and each stop's *Off path* / *Pin is on water* warnings; the walk and stop listeners show them.
 *
 * Nothing is called while the route still matches the pins (`route.key`), so a question edit
 * keeps the routed distance. Each set of pins is tried once per visit: a failure, or a route
 * that had to leave out a stop with no path near it, is not retried until the pins change.
 */
import { routeKey } from '@qualk/shared';
import { waitForPendingWrites } from '@react-native-firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorDetails, reroute } from '@/data/callables';
import { db } from '@/data/firebase';
import type { Stop, Walk } from '@/data/walks';

/** How long the pins must stay put before the walk is rerouted. */
export const REROUTE_DELAY_MS = 2000;

export type RerouteStatus =
  /** Nothing waiting: the route matches the pins, or these pins were routed as far as they go. */
  | { kind: 'idle' }
  /** Waiting for the pins to settle, or the call is running. */
  | { kind: 'routing' }
  /** Offline: straight lines until the connection is back. */
  | { kind: 'offline' }
  /** The last call failed; straight lines until the next change. */
  | { kind: 'failed'; message: string };

function failureText(err: unknown): string {
  const code = (err as { code?: string } | undefined)?.code;
  const reason = errorDetails(err).reason;
  if (reason === 'unroutable') {
    return 'The Start pin isn’t near a path, so distances are as the crow flies. Move it onto a street or path.';
  }
  if (code === 'functions/resource-exhausted') {
    return 'That’s a lot of route changes. Distances are as the crow flies for now.';
  }
  return 'Couldn’t find a walking route just now. Distances are as the crow flies until the next change.';
}

export function useRerouteOnSave(
  walk: Walk | undefined,
  stops: Stop[],
  offline: boolean,
): { status: RerouteStatus; flush: () => Promise<void> } {
  const editable = walk?.status === 'draft' || walk?.status === 'ready';
  const key =
    walk && stops.length > 0
      ? routeKey(
          walk.start,
          stops.map((s) => s.location),
        )
      : undefined;
  const matches = key === undefined || walk?.route?.key === key;
  const needed = editable && !matches && key !== undefined;

  const tried = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = useRef<Promise<void> | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /** The pins of the last finished call, and its failure if it failed. */
  const [done, setDone] = useState<{ key: string; failure?: string }>();
  const latest = useRef({ walkId: walk?.id, key, needed, offline });
  useEffect(() => {
    latest.current = { walkId: walk?.id, key, needed, offline };
  });

  const run = useCallback(async (): Promise<void> => {
    if (running.current) return running.current;
    const { walkId, key: k, needed: n, offline: off } = latest.current;
    if (!walkId || !k || !n || off || tried.current.has(k)) return;
    tried.current.add(k);
    setBusy(true);
    const task = (async () => {
      try {
        // reroute reads the stops on the server, so the queued edits must be there first.
        await waitForPendingWrites(db);
        await reroute(walkId);
        setDone({ key: k });
      } catch (err) {
        setDone({ key: k, failure: failureText(err) });
      } finally {
        running.current = undefined;
        setBusy(false);
      }
    })();
    running.current = task;
    return task;
  }, []);

  // Debounce: every change to the pins restarts the wait.
  useEffect(() => {
    if (!needed || offline || !key || tried.current.has(key)) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void run();
    }, REROUTE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
    };
    // `busy` re-arms the wait once a call for older pins has finished.
  }, [key, needed, offline, busy, run]);

  // Leaving C4 with a change still waiting: route it now; the call finishes on its own.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = undefined;
        void run();
      }
    },
    [run],
  );

  /** Publish: route a waiting change first, so the published distance is the routed one. */
  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    await running.current;
    await run();
  }, [run]);

  let status: RerouteStatus;
  if (busy) status = { kind: 'routing' };
  else if (!needed) status = { kind: 'idle' };
  else if (done?.key === key && done.failure) status = { kind: 'failed', message: done.failure };
  else if (done?.key === key) status = { kind: 'idle' };
  else if (offline) status = { kind: 'offline' };
  else status = { kind: 'routing' };
  return { status, flush };
}
