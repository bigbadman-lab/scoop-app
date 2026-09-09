import type { LaunchConcept } from '@scoop/news';

/** Concept generation: 3 / 60s / IP */
export const LAUNCH_ASSIST_RATE_LIMIT = {
  windowMs: 60_000,
  maxHits: 3,
} as const;

/** Artwork generation is more expensive — stricter than concepts. */
export const LAUNCH_ASSIST_ARTWORK_RATE_LIMIT = {
  windowMs: 60_000,
  maxHits: 2,
} as const;

export type PublicLaunchConcept = {
  id: LaunchConcept['id'];
  name: string;
  ticker: string;
  description: string;
  recommendedPairAddress: string;
  recommendedPairSymbol: string;
  pairRationale: string;
  imageDirection: string;
  /** False when the recommended pair is no longer in the enabled catalogue. */
  pairEnabled: boolean;
};

export type LaunchAssistArticle = {
  providerArticleId: string;
  headline: string;
  sourceDomain: string;
  publishedAt: string;
  url: string;
};

/** Intermediate handoff after concept pick (before / during artwork). */
export type SelectedLaunchConceptHandoff = {
  providerArticleId: string;
  article: LaunchAssistArticle;
  concept: PublicLaunchConcept;
  selectedAt: string;
};

export const LAUNCH_ASSIST_HANDOFF_KEY = 'scoop:launch-assist:selected-concept';

/** Explicit marker so manual `/launch` never consumes stale assist state. */
export const ASSISTED_LAUNCH_MARKER = 'scoop-assist-v1' as const;

export type SelectedTokenImage =
  | {
      /** Funnel V2 — artwork still generating; launch form shows pending UI. */
      source: 'pending';
      previewUrl: null;
      fileName: null;
      mimeType: null;
      byteSize: null;
      draftId: string;
      artworkAssetId?: null;
    }
  | {
      source: 'generated';
      previewUrl: string;
      fileName: string | null;
      mimeType: string;
      byteSize: number | null;
      artworkAssetId: string;
      draftId: string;
    }
  | {
      source: 'upload';
      previewUrl: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    };

/** Consumed once by `/launch?assist=1`. */
export type AssistedLaunchHandoff = {
  marker: typeof ASSISTED_LAUNCH_MARKER;
  providerArticleId: string;
  article: LaunchAssistArticle;
  concept: PublicLaunchConcept;
  draftId: string | null;
  quoteAsset: string;
  quoteSymbol: string;
  image: SelectedTokenImage;
  createdAt: string;
};

export const ASSISTED_LAUNCH_HANDOFF_KEY = 'scoop:launch-assist:launch-prefill';

/** Public artwork option — no model/style/provider internals. */
export type PublicArtworkOption = {
  assetId: string;
  index: 1 | 2 | 3;
  previewUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

export type PublicArtworkResponse = {
  draftId: string;
  images: PublicArtworkOption[];
};

export function toPublicLaunchConcept(
  concept: LaunchConcept,
  enabledAddresses: ReadonlySet<string>,
): PublicLaunchConcept {
  const address = concept.recommendedPairAddress.trim().toLowerCase();
  return {
    id: concept.id,
    name: concept.name,
    ticker: concept.ticker,
    description: concept.description,
    recommendedPairAddress: address,
    recommendedPairSymbol: concept.recommendedPairSymbol,
    pairRationale: concept.pairRationale,
    imageDirection: concept.imageDirection,
    pairEnabled: enabledAddresses.has(address),
  };
}

/** Strip product-only fields before calling createNewsLaunchDraft. */
export function toLaunchConceptInput(
  concept: PublicLaunchConcept,
): LaunchConcept {
  return {
    id: concept.id,
    name: concept.name,
    ticker: concept.ticker,
    description: concept.description,
    recommendedPairAddress: concept.recommendedPairAddress,
    recommendedPairSymbol: concept.recommendedPairSymbol,
    pairRationale: concept.pairRationale,
    imageDirection: concept.imageDirection,
  };
}

export function isLaunchConceptId(value: unknown): value is LaunchConcept['id'] {
  return value === 'concept_1' || value === 'concept_2' || value === 'concept_3';
}
