/**
 * Google's Gemini API (generateContent, REST), with one Google AI Studio key in the project's
 * Secret Manager as GEMINI_API_KEY. Checked against aistudio.google.com/docs on 2026-11-27.
 */
import { requestJson, ServiceError, type Fetch } from '../net';
import type { Llm, LlmRequest, LlmResult } from './llm';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

/** Thrown when the model answered but not with usable JSON. */
export class LlmOutputError extends Error {}

/** Takes the JSON out of a reply, tolerating a code fence around it. */
export function parseJsonReply<T>(text: string): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new LlmOutputError(`Not JSON: ${trimmed.slice(0, 120)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds from a 429's RetryInfo ("13s"), if it says. */
function retryDelayS(body: unknown): number | undefined {
  const details = (body as { error?: { details?: { retryDelay?: string }[] } })?.error?.details;
  const delay = details?.find((d) => d.retryDelay)?.retryDelay;
  const s = delay ? Number.parseFloat(delay) : Number.NaN;
  return Number.isFinite(s) ? s : undefined;
}

export function geminiLlm(apiKey: string, fetchImpl?: Fetch): Llm {
  return {
    async json<T>(req: LlmRequest): Promise<LlmResult<T>> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: req.schema,
          maxOutputTokens: req.maxOutputTokens ?? 16_384,
          ...(req.thinking ? { thinkingConfig: { thinkingLevel: req.thinking } } : {}),
        },
      };
      const url = `${BASE}/${encodeURIComponent(req.model)}:generateContent`;
      for (let attempt = 0; ; attempt++) {
        let res: GeminiResponse;
        try {
          res = await requestJson<GeminiResponse>(
            url,
            {
              method: 'POST',
              headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
            { service: 'gemini', timeoutMs: 180_000, retries: 0, fetch: fetchImpl },
          );
        } catch (err) {
          if (err instanceof ServiceError && err.transient && attempt < 4) {
            const wait = retryDelayS(err.body) ?? 2 ** attempt * 2;
            await sleep(Math.min(60, wait) * 1000);
            continue;
          }
          throw err;
        }
        const candidate = res.candidates?.[0];
        const text = (candidate?.content?.parts ?? [])
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text)
          .join('');
        const usage = {
          model: req.model,
          inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
          thinkingTokens: res.usageMetadata?.thoughtsTokenCount ?? 0,
        };
        if (!text) {
          const why = res.promptFeedback?.blockReason ?? candidate?.finishReason ?? 'empty';
          throw Object.assign(new LlmOutputError(`No answer (${why})`), { usage });
        }
        return { data: parseJsonReply<T>(text), usage };
      }
    },
  };
}
