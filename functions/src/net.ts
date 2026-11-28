/**
 * HTTP for the outside services (OpenRouteService, Overpass, Wikipedia, Wikidata, Gemini).
 * Every call has a timeout, and the tests swap `fetch` for recorded responses, so CI never
 * calls a live service.
 */

/** The same signature as the global fetch; tests pass a fake. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Overpass and Wikimedia ask automated clients to say who they are. */
export const USER_AGENT = 'Qualk/1.0 (https://qualk.dk; quiz walks)';

/** A service failed, timed out or refused. `status` is the HTTP status when there was one. */
export class ServiceError extends Error {
  constructor(
    readonly service: string,
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(`${service}: ${message}`);
  }

  /** Worth trying again: a timeout, rate limiting or a server error. */
  get transient(): boolean {
    return this.status === undefined || this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions {
  service: string;
  timeoutMs?: number;
  /** Extra tries after a transient failure, with a short backoff. */
  retries?: number;
  fetch?: Fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetches and parses JSON. Non-2xx responses throw a ServiceError carrying the parsed body. */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  opts: RequestOptions,
): Promise<T> {
  const doFetch = opts.fetch ?? fetch;
  const retries = opts.retries ?? 0;
  let lastError: ServiceError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(8000, 500 * 2 ** attempt));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await doFetch(url, { ...init, signal: controller.signal });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        // Keep the text: some services answer errors in HTML.
      }
      if (!res.ok) {
        lastError = new ServiceError(opts.service, `HTTP ${res.status}`, res.status, body);
        if (lastError.transient && attempt < retries) continue;
        throw lastError;
      }
      if (typeof body === 'string' || body === undefined) {
        throw new ServiceError(opts.service, 'not JSON', res.status, text.slice(0, 200));
      }
      return body as T;
    } catch (err) {
      // HTTP failures were retried above; these are final.
      if (err instanceof ServiceError) throw err;
      lastError = new ServiceError(
        opts.service,
        controller.signal.aborted ? 'timed out' : String(err),
      );
      if (attempt < retries) continue;
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new ServiceError(opts.service, 'failed');
}
