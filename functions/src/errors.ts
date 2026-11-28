import type { CallableErrorDetails } from '@qualk/shared';

export type QualkErrorCode =
  | 'not-found'
  | 'permission-denied'
  | 'failed-precondition'
  | 'invalid-argument'
  | 'resource-exhausted'
  | 'unavailable';

/** A failure the caller can show as it is. Callables turn it into an HttpsError. */
export class QualkError extends Error {
  constructor(
    readonly code: QualkErrorCode,
    message: string,
    readonly details?: CallableErrorDetails,
  ) {
    super(message);
  }

  /** publishWalk and openWalk: what blocks, for C4's and C6's lists. */
  get problems() {
    return this.details?.problems;
  }
}
