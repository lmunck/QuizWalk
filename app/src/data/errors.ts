/**
 * Writes are not awaited where play must work offline: the native SDK queues them and only
 * resolves on the server's acknowledgement. A rejected write is reported here instead, and
 * the app shows it as a short notice.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function onWriteError(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportError(message: string, err?: unknown): void {
  if (err) console.warn(message, err);
  listeners.forEach((l) => l(message));
}

/** Use as `.catch(failed('Could not save the stop'))`. */
export const failed =
  (message: string) =>
  (err: unknown): void =>
    reportError(message, err);

/** The message a callable or Firestore error carries, if it is meant for people. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string };
    if (e.code === 'functions/unavailable' || e.code === 'firestore/unavailable') {
      return "You're offline. Try again when you have a connection.";
    }
    if (
      typeof e.message === 'string' &&
      e.message.length > 0 &&
      e.message.length < 200 &&
      (e.code?.startsWith('functions/') ?? false) &&
      e.code !== 'functions/internal'
    ) {
      // Callables send their message from QualkError, written for people.
      return e.message.replace(/^\[functions\/[a-z-]+\]\s*/, '');
    }
  }
  return fallback;
}
