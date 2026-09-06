import OpenAI from 'openai';

export const DEFAULT_OPENAI_CONCEPT_MODEL = 'gpt-5.6-terra';

export type OpenAiConceptClientConfig = {
  apiKey?: string;
  model?: string;
  /** Max output tokens for structured concepts. */
  maxOutputTokens?: number;
};

export function loadOpenAiConceptConfig(
  env: NodeJS.ProcessEnv = process.env,
): Required<OpenAiConceptClientConfig> {
  const apiKey = (env.OPENAI_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }
  const model = (env.OPENAI_CONCEPT_MODEL ?? DEFAULT_OPENAI_CONCEPT_MODEL).trim() || DEFAULT_OPENAI_CONCEPT_MODEL;
  return {
    apiKey,
    model,
    maxOutputTokens: Number.parseInt(env.OPENAI_CONCEPT_MAX_OUTPUT_TOKENS ?? '1200', 10) || 1200,
  };
}

export function createOpenAiClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}
