/**
 * A fake writer and checker, for tests and for trying the fill script without spending
 * anything (`--fake`). Writes numbered questions; the checker fails every fifth.
 */
import type { Llm, LlmRequest, LlmResult } from './llm';

export interface FakeLlmOptions {
  /** Tokens reported per call, so cost accounting can be tested. */
  usage?: { input: number; output: number };
  /** Called with each request, to look at the prompts. */
  onRequest?: (req: LlmRequest) => void;
  /** Make the writer fail. */
  failWriter?: boolean;
}

export function fakeLlm(opts: FakeLlmOptions = {}): Llm & { calls: LlmRequest[] } {
  let serial = 0;
  const calls: LlmRequest[] = [];
  return {
    calls,
    async json<T>(req: LlmRequest): Promise<LlmResult<T>> {
      calls.push(req);
      opts.onRequest?.(req);
      const usage = {
        model: req.model,
        inputTokens: opts.usage?.input ?? 1000,
        outputTokens: opts.usage?.output ?? 2000,
        thinkingTokens: 0,
      };
      if (req.schema.properties && 'verdicts' in (req.schema.properties as object)) {
        const count = (req.prompt.match(/^\d+\. /gm) ?? []).length;
        const verdicts = Array.from({ length: count }, (_, index) => ({
          index,
          pass: index % 5 !== 4,
          ...(index % 5 === 4 ? { reason: 'fake failure' } : {}),
        }));
        return { data: { verdicts } as T, usage };
      }
      if (opts.failWriter) throw new Error('writer failed');
      const n = Number(/Write (\d+) questions/.exec(req.prompt)?.[1] ?? 5);
      const place = /about the place "([^"]+)"/.exec(req.prompt)?.[1];
      const questions = Array.from({ length: n }, () => {
        serial++;
        return {
          question: `${place ? `At ${place}, which` : 'Which'} fake fact number ${serial} is true?`,
          correct: `Answer ${serial}`,
          wrong: [`Wrong ${serial}a`, `Wrong ${serial}b`, `Wrong ${serial}c`],
          explanation: `Fake fact ${serial}.`,
          ...(place ? { difficulty: ['kids', 'mixed', 'expert'][serial % 3] } : {}),
        };
      });
      return { data: { questions } as T, usage };
    },
  };
}
