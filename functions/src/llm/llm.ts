/**
 * The language-model interface (spec §1 Content). Gemini implements it; tests and the fill
 * script's `--fake` run use a fake. Model ids are configuration (spec §8): GEMINI_WRITER_MODEL
 * and GEMINI_CHECKER_MODEL in functions/.env.
 */

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface LlmRequest {
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
  thinking?: ThinkingLevel;
  maxOutputTokens?: number;
}

export interface LlmUsage {
  model: string;
  inputTokens: number;
  /** Visible output, without thinking. */
  outputTokens: number;
  /** Billed at the output price. */
  thinkingTokens: number;
}

export interface LlmResult<T> {
  data: T;
  usage: LlmUsage;
}

export interface Llm {
  json<T>(req: LlmRequest): Promise<LlmResult<T>>;
}

/** Which model writes and which checks. The checker is a different, stronger model. */
export interface Models {
  writer: string;
  checker: string;
}

export const DEFAULT_MODELS: Models = {
  writer: 'gemini-3.8-flash',
  checker: 'gemini-4-argon',
};
