import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions';
import { defineBoolean, defineSecret, defineString } from 'firebase-functions/params';
import {
  onDocumentCreated,
  onDocumentUpdated,
  onDocumentWritten,
  onDocumentWrittenWithAuthContext,
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
import { runTopUp, TOP_UPS } from './bank/topup';
import { generateWalk as generateWalkCore, requestTopUps } from './generate';
import { geminiLlm } from './llm/gemini';
import type { Models } from './llm/llm';
import { DEFAULT_OVERPASS_URLS, overpassClient } from './places/overpass';
import { wikiClient } from './places/wiki';
import { checkRateLimit } from './rateLimit';
import { applyReport, countAnswer, countStopChange } from './reports';
import { pushBlockedAlert, pushFinishNews, pushStatusChange, teamJustLeft } from './push';
import { orsRouter } from './routing/ors';
import { reroute as rerouteCore } from './routing/reroute';
import { routeForView as routeForViewCore } from './routing/view';
import type { Services } from './services';
import { swapQuestion as swapQuestionCore } from './swap';

// Firestore lives in europe-west1 and functions run next to it (docs/v1-spec.md §1).
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();
const db = () => getFirestore();

/**
 * App Check on every callable (spec §7, §8). On by default; functions/.env.local turns it off
 * for the emulator only. Dev builds pass with a debug token registered in the console (§18).
 */
const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: true });

/** Secret Manager (spec §8). A function that declares a secret can't deploy until it exists. */
const geminiKey = defineSecret('GEMINI_API_KEY');
const orsKey = defineSecret('ORS_API_KEY');

/** Model ids are configuration (spec §8), set in functions/.env. */
const writerModel = defineString('GEMINI_WRITER_MODEL', { default: 'gemini-3.8-flash' });
const checkerModel = defineString('GEMINI_CHECKER_MODEL', { default: 'gemini-4-argon' });
const overpassUrls = defineString('OVERPASS_URLS', { default: DEFAULT_OVERPASS_URLS.join(',') });

const models = (): Models => ({ writer: writerModel.value(), checker: checkerModel.value() });

/** The outside services for one call. Gemini only when its key is declared for the function. */
function services(opts: { gemini?: boolean; ors?: boolean } = {}): Services {
  return {
    db: db(),
    llm: opts.gemini ? geminiLlm(geminiKey.value()) : undefined,
    models: models(),
    overpass: overpassClient(
      overpassUrls
        .value()
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean),
    ),
    wiki: wikiClient(),
    router: opts.ors ? orsRouter(orsKey.value()) : undefined,
    rng: Math.random,
    now: Date.now,
  };
}

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
      throw new HttpsError(err.code, err.message, err.details);
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

// ------------------------------------------------------------------ M4: generation

/** C2's Refresh: a walking loop fitted to the view. Writes nothing. */
export const routeForView = onCall({ ...callable, secrets: [orsKey] }, (req) =>
  run(async () => {
    const uid = creatorUid(req);
    await checkRateLimit(db(), uid, 'routeForView');
    return routeForViewCore(orsRouter(orsKey.value()), req.data);
  }),
);

/** C4 after a save: the walking route through the pins, and Off path / on water warnings. */
export const reroute = onCall({ ...callable, secrets: [orsKey], timeoutSeconds: 60 }, (req) =>
  run(async () => {
    const uid = creatorUid(req);
    await checkRateLimit(db(), uid, 'reroute');
    const svc = services({ ors: true });
    return rerouteCore(svc.db, svc.router!, svc.overpass, uid, req.data?.walkId);
  }),
);

/** C2's Next: names the stops, picks and writes questions. Progress in generationJobs. */
export const generateWalk = onCall(
  { ...callable, secrets: [geminiKey], timeoutSeconds: 300, memory: '512MiB' },
  (req) =>
    run(async () => {
      const uid = creatorUid(req);
      await checkRateLimit(db(), uid, 'generateWalk');
      return generateWalkCore(services({ gemini: true }), uid, req.data);
    }),
);

/** C5's Swap and G2's Suggest a question: a proposal, never written here. */
export const swapQuestion = onCall(
  { ...callable, secrets: [geminiKey], timeoutSeconds: 120 },
  (req) =>
    run(async () => {
      const uid = creatorUid(req);
      await checkRateLimit(db(), uid, 'swapQuestion');
      return swapQuestionCore(services({ gemini: true }), uid, req.data);
    }),
);

/** Adds 20–25 questions to one pool when a pick finds it running low. */
export const topUpQuestions = onDocumentWritten(
  { document: `${TOP_UPS}/{poolKey}`, secrets: [geminiKey], timeoutSeconds: 300 },
  async (event) => {
    const after = event.data?.after.data();
    if (after?.status !== 'queued' || event.data?.before.data()?.status === 'queued') return;
    await runTopUp(db(), geminiLlm(geminiKey.value()), models(), event.params.poolKey);
  },
);

/** P4's Report question: counts and status on the bank question. */
export const onQuestionReported = onDocumentCreated('questionReports/{reportId}', async (event) => {
  const report = event.data?.data();
  if (!report) return;
  const hidden = await applyReport(db(), report);
  if (hidden) await requestTopUps(services(), [hidden]);
});

/**
 * A creator swapping, editing away or deleting a bank question counts against it. Only writes
 * from the app count: functions (generateWalk, deleteWalk) write stops with their service
 * account, and those are left out.
 */
export const onStopWritten = onDocumentWrittenWithAuthContext(
  'walks/{walkId}/stops/{stopId}',
  async (event) => {
    if (event.authType === 'service_account' || event.authType === 'system') return;
    const hidden = await countStopChange(db(), event.data?.before.data(), event.data?.after.data());
    if (hidden.length > 0) await requestTopUps(services(), hidden);
  },
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
    // The bank question's answered/correct counts (spec §8), once per answer.
    const hidden = await countAnswer(db(), walkId, teamUid, event.params.stopId);
    if (hidden) await requestTopUps(services(), [hidden]);
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
