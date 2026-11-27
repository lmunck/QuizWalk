/**
 * Gemini API prices, Standard (paid) tier, USD per million tokens. Thinking tokens are billed
 * as output. From aistudio.google.com/docs/pricing (ai.google.dev redirects there), read on
 * 2026-11-27. Two changes were already announced and are in the table: Gemini 4 doubles on
 * 2026-12-01, and 3.6/3.8 Flash double on 2027-01-01. Check again before a large run.
 */
import type { LlmUsage } from './llm';

interface Price {
  /** This price applies before this date (ISO, UTC); the last entry has none. */
  until?: string;
  inputPerM: number;
  outputPerM: number;
}

export const PRICES: Record<string, Price[]> = {
  'gemini-4-carbon': [
    { until: '2026-12-01', inputPerM: 2, outputPerM: 10 },
    { inputPerM: 4, outputPerM: 20 },
  ],
  'gemini-4-argon': [
    { until: '2026-12-01', inputPerM: 2, outputPerM: 10 },
    { inputPerM: 4, outputPerM: 20 },
  ],
  'gemini-4-neon': [{ inputPerM: 3, outputPerM: 15 }],
  'gemini-4-hydrogen': [{ inputPerM: 1.5, outputPerM: 7.5 }],
  'gemini-3.8-flash': [
    { until: '2027-01-01', inputPerM: 0.75, outputPerM: 3.75 },
    { inputPerM: 1.5, outputPerM: 7.5 },
  ],
  'gemini-3.6-flash': [
    { until: '2027-01-01', inputPerM: 0.75, outputPerM: 3.75 },
    { inputPerM: 1.5, outputPerM: 7.5 },
  ],
  'gemini-3.5-flash-lite': [{ inputPerM: 0.3, outputPerM: 2.5 }],
  'gemini-3.1-flash-lite': [{ inputPerM: 0.25, outputPerM: 1.5 }],
};

export function hasPrice(model: string): boolean {
  return model in PRICES;
}

export function priceAt(model: string, atMs: number): Price {
  const periods = PRICES[model];
  if (!periods) throw new Error(`No price for ${model}: add it to functions/src/llm/pricing.ts`);
  const found = periods.find((p) => !p.until || atMs < Date.parse(`${p.until}T00:00:00Z`));
  return found ?? (periods[periods.length - 1] as Price);
}

/** Estimated cost of one call in USD. */
export function costUsd(u: LlmUsage, atMs = Date.now()): number {
  const p = priceAt(u.model, atMs);
  return (u.inputTokens * p.inputPerM + (u.outputTokens + u.thinkingTokens) * p.outputPerM) / 1e6;
}

export function totalCostUsd(usages: LlmUsage[], atMs = Date.now()): number {
  return usages.reduce((sum, u) => sum + costUsd(u, atMs), 0);
}
