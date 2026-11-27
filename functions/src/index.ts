import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions';
import { defineBoolean } from 'firebase-functions/params';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  deleteWalk as deleteWalkCore,
  duplicateWalk as duplicateWalkCore,
  endExpiredWalks,
  openWalk as openWalkCore,
  publishWalk as publishWalkCore,
  QualkError,
  recomputeAllTeams,
  recomputeTeam,
} from './core';
import { pushBlockedAlert, pushFinishNews, pushStatusChange, teamJustLeft } from './push';

// Firestore lives in europe-west1 and functions run next to it (docs/v1-spec.md §1).
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();
const db = () => getFirestore();

/**
 * App Check on every callable (spec §7, §8). On by default; functions/.env.local turns it off
 * for the emulator only. Dev builds pass with a debug token registered in the console (§18).
 */
const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: true });

/** Callables that only signed-in creators may use. */
function creatorUid(req: CallableRequest): string {
  const auth = req.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  if (auth.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Sign in with Apple or Google first.');
  }
  return auth.uid;
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof QualkError) {
      throw new HttpsError(
        err.code,
        err.message,
        err.problems ? { problems: err.problems } : undefined,
      );
    }
    throw err;
  }
}

const callable = { enforceAppCheck, cors: false } as const;

// ------------------------------------------------------------------ callables

export const publishWalk = onCall(callable, (req) =>
  run(() => publishWalkCore(db(), creatorUid(req), req.data?.walkId)),
);

export const openWalk = onCall(callable, (req) =>
  run(() => openWalkCore(db(), creatorUid(req), req.data?.walkId, req.data?.openFor)),
);

export const deleteWalk = onCall(callable, (req) =>
  run(async () => {
    await deleteWalkCore(db(), creatorUid(req), req.data?.walkId);
    return { ok: true };
  }),
);

export const duplicateWalk = onCall(callable, (req) =>
  run(() => duplicateWalkCore(db(), creatorUid(req), req.data?.walkId)),
);

// ------------------------------------------------------------------ triggers

/** Scores the answer and derives the team's totals from scratch (m1-design §5). */
export const onAnswerCreated = onDocumentCreated(
  'walks/{walkId}/teams/{teamUid}/answers/{stopId}',
  async (event) => {
    const { walkId, teamUid } = event.params;
    const teamRef = db().doc(`walks/${walkId}/teams/${teamUid}`);
    const wasFinished = (await teamRef.get()).data()?.finishedAt != null;
    await recomputeTeam(db(), walkId, teamUid);
    await pushFinishNews(db(), walkId, teamUid, wasFinished);
  },
);

/**
 * A team leaving mid-walk may leave nobody walking: "Everyone has finished" then goes to the
 * creator, as it does after the last answer. Teams write often (distance walked), so
 * everything but a fresh `leftAt` returns at once.
 */
export const onTeamUpdated = onDocumentUpdated('walks/{walkId}/teams/{teamUid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!teamJustLeft(before, after)) return;
  await pushFinishNews(db(), event.params.walkId, event.params.teamUid, before?.finishedAt != null);
});

/** Skip for everyone: points on the stop are voided and every team is recalculated. */
export const onStopUpdated = onDocumentUpdated('walks/{walkId}/stops/{stopId}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before?.skippedForAll === after?.skippedForAll) return;
  await recomputeAllTeams(db(), event.params.walkId);
});

export const onWalkStatusChanged = onDocumentWritten('walks/{walkId}', async (event) => {
  const after = event.data?.after.data();
  if (!after) return;
  await pushStatusChange(db(), event.params.walkId, event.data?.before.data()?.status, after);
});

export const onAlertCreated = onDocumentCreated(
  'walks/{walkId}/alerts/{alertId}',
  async (event) => {
    const alert = event.data?.data();
    if (alert) await pushBlockedAlert(db(), event.params.walkId, alert);
  },
);

// ------------------------------------------------------------------ schedules

/** Hourly, so a 12-hour walk is never left open for more than 13 (spec §8). */
export const hourly = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'Europe/Copenhagen' },
  async () => {
    await endExpiredWalks(db());
  },
);
