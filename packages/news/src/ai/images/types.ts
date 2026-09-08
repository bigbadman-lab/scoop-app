import type { LaunchConcept } from '../types.js';

export type ArtworkStyleId = 'art_1' | 'art_2' | 'art_3';
export type ArtworkStyle = 'iconic' | 'memetic' | 'editorial_abstract';

export const ARTWORK_STYLES: ReadonlyArray<{
  id: ArtworkStyleId;
  style: ArtworkStyle;
}> = [
  { id: 'art_1', style: 'iconic' },
  { id: 'art_2', style: 'memetic' },
  { id: 'art_3', style: 'editorial_abstract' },
] as const;

export type GenerateTokenArtworkInput = {
  providerArticleId: string;
  concept: LaunchConcept;
};

export type TokenArtworkOption = {
  id: ArtworkStyleId;
  style: ArtworkStyle;
  mimeType: 'image/png' | 'image/webp';
  width: 1024;
  height: 1024;
  assetId: string;
  previewUrl?: string;
  /** SCOOP public display copy when upload succeeded. */
  displayImageUrl?: string;
  generation: {
    model: string;
    quality: string;
  };
};

export type GeneratedImageBytes = {
  id: ArtworkStyleId;
  style: ArtworkStyle;
  mimeType: 'image/png';
  width: 1024;
  height: 1024;
  bytes: Buffer;
  model: string;
  quality: string;
};

export type LaunchDraftSourceType = 'news' | 'standard';

export type LaunchDraft = {
  id: string;
  sourceType: LaunchDraftSourceType;
  source?: {
    provider: string;
    providerArticleId: string;
    headline: string;
  };
  name: string;
  symbol: string;
  description: string;
  quote: {
    address: string;
    symbol: string;
  };
  artworks: TokenArtworkOption[];
  selectedArtworkId: string | null;
  status: 'draft';
  createdAt: string;
  updatedAt: string;
};

export type CreateNewsLaunchDraftInput = {
  providerArticleId: string;
  concept: LaunchConcept;
};

export type UpdateLaunchDraftPatch = {
  name?: string;
  symbol?: string;
  description?: string;
  quoteAssetAddress?: string;
};
