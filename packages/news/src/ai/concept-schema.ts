import { z } from 'zod';
import type { LaunchConcept, LaunchConceptResponse } from './types.js';

export const LaunchConceptIdSchema = z.enum(['concept_1', 'concept_2', 'concept_3']);

export const LaunchConceptSchema = z.object({
  id: LaunchConceptIdSchema,
  name: z.string().min(1).max(48),
  ticker: z.string().min(2).max(10),
  description: z.string().min(1).max(400),
  recommendedPairAddress: z.string().min(1),
  recommendedPairSymbol: z.string().min(1).max(32),
  pairRationale: z.string().min(1).max(400),
  imageDirection: z.string().min(1).max(400),
});

/** Model may return concepts array; we still enforce exactly 3 after parse. */
export const LaunchConceptsModelSchema = z.object({
  concepts: z.array(LaunchConceptSchema).min(3).max(3),
});

export type LaunchConceptsModelOutput = z.infer<typeof LaunchConceptsModelSchema>;

export function toLaunchConceptResponse(
  article: { providerArticleId: string; headline: string },
  concepts: [LaunchConcept, LaunchConcept, LaunchConcept],
): LaunchConceptResponse {
  return {
    article: {
      providerArticleId: article.providerArticleId,
      headline: article.headline,
    },
    concepts,
  };
}
