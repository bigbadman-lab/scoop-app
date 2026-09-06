import type OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { Queryable } from '@scoop/db';
import { createOpenAiClient, loadOpenAiConceptConfig } from './client.js';
import {
  LaunchConceptsModelSchema,
  toLaunchConceptResponse,
  type LaunchConceptsModelOutput,
} from './concept-schema.js';
import { CONCEPT_SYSTEM_PROMPT, buildConceptUserPrompt, buildRepairUserPrompt } from './prompt.js';
import { ConceptValidationError, validateAndNormalizeConcepts } from './validation.js';
import { getEnabledQuoteAssets } from '../repos/quotes.js';
import { getNewsArticleForConcepts } from '../repos/article.js';
import type {
  ConceptArticleContext,
  EnabledQuoteAsset,
  GenerateLaunchConceptsInput,
  GenerateLaunchConceptsResult,
} from './types.js';

export type ConceptModelCaller = (input: {
  system: string;
  user: string;
  model: string;
  maxOutputTokens: number;
}) => Promise<{
  parsed: LaunchConceptsModelOutput;
  inputTokens: number | null;
  outputTokens: number | null;
}>;

export function createResponsesModelCaller(client: OpenAI): ConceptModelCaller {
  return async ({ system, user, model, maxOutputTokens }) => {
    const response = await client.responses.parse({
      model,
      max_output_tokens: maxOutputTokens,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: {
        format: zodTextFormat(LaunchConceptsModelSchema, 'launch_concepts'),
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      throw new ConceptValidationError('OpenAI returned empty structured output');
    }

    const usage = response.usage;
    return {
      parsed: LaunchConceptsModelSchema.parse(parsed),
      inputTokens: usage?.input_tokens ?? null,
      outputTokens: usage?.output_tokens ?? null,
    };
  };
}

export type GenerateLaunchConceptsDeps = {
  db: Queryable;
  callModel?: ConceptModelCaller;
  /** Inject quotes for tests; otherwise load from DB. */
  enabledQuotes?: EnabledQuoteAsset[];
  /** Inject article for tests. */
  article?: ConceptArticleContext;
  model?: string;
  maxOutputTokens?: number;
  apiKey?: string;
};

/**
 * On-demand: one stored article + live enabled quotes → exactly 3 validated concepts.
 * Stateless — does not persist concepts.
 */
export async function generateLaunchConcepts(
  input: GenerateLaunchConceptsInput,
  deps: GenerateLaunchConceptsDeps,
): Promise<GenerateLaunchConceptsResult> {
  const providerArticleId = input.providerArticleId?.trim();
  if (!providerArticleId) {
    throw new ConceptValidationError('providerArticleId is required');
  }

  const article =
    deps.article ?? (await getNewsArticleForConcepts(deps.db, providerArticleId));
  if (!article) {
    throw new ConceptValidationError(`Article not found: ${providerArticleId}`);
  }

  const enabledQuotes =
    deps.enabledQuotes ?? (await getEnabledQuoteAssets(deps.db));
  if (enabledQuotes.length === 0) {
    throw new ConceptValidationError('No enabled quote assets — cannot generate concepts');
  }

  const model =
    deps.model ??
    ((process.env.OPENAI_CONCEPT_MODEL ?? '').trim() || 'gpt-5.6-terra');
  const maxOutputTokens =
    deps.maxOutputTokens ??
    (Number.parseInt(process.env.OPENAI_CONCEPT_MAX_OUTPUT_TOKENS ?? '1200', 10) || 1200);

  let callModel = deps.callModel;
  if (!callModel) {
    const cfg = loadOpenAiConceptConfig();
    callModel = createResponsesModelCaller(
      createOpenAiClient(deps.apiKey ?? cfg.apiKey),
    );
  }

  const started = Date.now();
  let repairAttempted = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const attempt = async (user: string) => {
    const result = await callModel({
      system: CONCEPT_SYSTEM_PROMPT,
      user,
      model,
      maxOutputTokens,
    });
    inputTokens =
      inputTokens == null
        ? result.inputTokens
        : result.inputTokens == null
          ? inputTokens
          : inputTokens + result.inputTokens;
    outputTokens =
      outputTokens == null
        ? result.outputTokens
        : result.outputTokens == null
          ? outputTokens
          : outputTokens + result.outputTokens;
    return validateAndNormalizeConcepts(result.parsed, enabledQuotes);
  };

  let concepts;
  try {
    concepts = await attempt(
      buildConceptUserPrompt({ article, quotes: enabledQuotes }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    repairAttempted = true;
    concepts = await attempt(
      buildRepairUserPrompt({
        article,
        quotes: enabledQuotes,
        previousError: message,
      }),
    );
  }

  const latencyMs = Date.now() - started;
  const response = toLaunchConceptResponse(
    { providerArticleId: article.providerArticleId, headline: article.headline },
    concepts,
  );

  return {
    response,
    usage: {
      model,
      latencyMs,
      inputTokens,
      outputTokens,
      repairAttempted,
    },
    enabledQuotes,
  };
}
