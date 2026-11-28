/** Callable Cloud Functions (spec §8). These need a connection; callers show their errors. */
import type {
  CallableErrorDetails,
  GenerateWalkRequest,
  GenerateWalkResponse,
  RouteForViewRequest,
  RouteForViewResponse,
  SwapQuestionRequest,
  SwapQuestionResponse,
  WalkOpenFor,
  WalkProblem,
} from '@qualk/shared';
import { httpsCallable } from '@react-native-firebase/functions';

import { functions } from './firebase';

async function call<In, Out>(name: string, data: In): Promise<Out> {
  const fn = httpsCallable<In, Out>(functions, name);
  const res = await fn(data);
  return res.data;
}

export function publishWalk(walkId: string) {
  return call<{ walkId: string }, { joinCode: string }>('publishWalk', { walkId });
}

export function openWalk(walkId: string, openFor: WalkOpenFor) {
  return call<
    { walkId: string; openFor: WalkOpenFor },
    { openedAtMs: number; openFor: WalkOpenFor }
  >('openWalk', { walkId, openFor });
}

export function deleteWalk(walkId: string) {
  return call<{ walkId: string }, { ok: true }>('deleteWalk', { walkId });
}

export function duplicateWalk(walkId: string) {
  return call<{ walkId: string }, { walkId: string }>('duplicateWalk', { walkId });
}

/** C2's Refresh (m4-generation-design §11). Writes nothing. */
export function routeForView(req: RouteForViewRequest) {
  return call<RouteForViewRequest, RouteForViewResponse>('routeForView', req);
}

/** C2's Next and C3's Try again. Progress is in generationJobs/{walkId}. */
export function generateWalk(req: GenerateWalkRequest) {
  return call<GenerateWalkRequest, GenerateWalkResponse>('generateWalk', req);
}

/** C5's Swap and G2's Suggest a question: a proposal to accept or discard. Writes nothing. */
export function swapQuestion(req: SwapQuestionRequest) {
  return call<SwapQuestionRequest, SwapQuestionResponse>('swapQuestion', req);
}

/** The `details` an M4 callable's error carries (`reason`, `retryAfterS`, …). */
export function errorDetails(err: unknown): CallableErrorDetails {
  const details = (err as { details?: unknown } | undefined)?.details;
  return details && typeof details === 'object' ? (details as CallableErrorDetails) : {};
}

/** The problems a refused publish or open carries, for listing them (C4, C6). */
export function problemsFrom(err: unknown): WalkProblem[] {
  const details = (err as { details?: { problems?: WalkProblem[] } }).details;
  return Array.isArray(details?.problems) ? details.problems : [];
}
