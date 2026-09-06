import { randomUUID } from 'node:crypto';
import type { Queryable } from '@scoop/db';
import { TIINGO_PROVIDER } from '../normalize.js';
import { getEnabledQuoteAssets } from '../repos/quotes.js';
import { getNewsArticleForConcepts } from '../repos/article.js';
import {
  ConceptValidationError,
  revalidateLaunchConcept,
  validateDraftTextFields,
} from '../ai/validation.js';
import type { LaunchConcept } from '../ai/types.js';
import { generateTokenArtworkOptions, type ImageModelCaller } from '../ai/images/generate.js';
import {
  buildArtworkStoragePath,
  isUuid,
} from '../ai/images/client.js';
import {
  createSupabaseDraftAssetStorage,
  type DraftAssetStorage,
} from '../ai/images/storage.js';
import type {
  CreateNewsLaunchDraftInput,
  LaunchDraft,
  TokenArtworkOption,
  UpdateLaunchDraftPatch,
} from '../ai/images/types.js';

type DraftRow = {
  id: string;
  source_type: 'news' | 'standard';
  provider: string | null;
  provider_article_id: string | null;
  name: string;
  symbol: string;
  description: string;
  quote_asset_address: string;
  quote_asset_symbol: string;
  concept_image_direction: string;
  selected_artwork_asset_id: string | null;
  status: 'draft';
  created_at: Date | string;
  updated_at: Date | string;
};

type ArtworkRow = {
  id: string;
  draft_id: string;
  generation_id: string;
  style_id: 'art_1' | 'art_2' | 'art_3';
  style: 'iconic' | 'memetic' | 'editorial_abstract';
  storage_path: string;
  mime_type: string;
  width: number;
  height: number;
  model: string;
  quality: string;
  selected: boolean;
  created_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export type DraftServiceDeps = {
  db: Queryable;
  storage?: DraftAssetStorage;
  callImage?: ImageModelCaller;
  imageModel?: string;
  imageQuality?: 'low' | 'medium' | 'high';
};

async function loadDraftRow(db: Queryable, draftId: string): Promise<DraftRow> {
  if (!isUuid(draftId)) {
    throw new ConceptValidationError('Malformed draft id');
  }
  const result = await db.query<DraftRow>(
    `SELECT * FROM launch_drafts WHERE id = $1`,
    [draftId],
  );
  const row = result.rows[0];
  if (!row) throw new ConceptValidationError(`Draft not found: ${draftId}`);
  return row;
}

async function loadArtworkRows(
  db: Queryable,
  draftId: string,
): Promise<ArtworkRow[]> {
  const result = await db.query<ArtworkRow>(
    `SELECT * FROM launch_draft_artworks
     WHERE draft_id = $1
     ORDER BY created_at DESC, style_id ASC`,
    [draftId],
  );
  return result.rows;
}

/** Latest generation set only (3 arts), plus any selected older art if needed. */
function pickArtworkSet(rows: ArtworkRow[]): ArtworkRow[] {
  if (rows.length === 0) return [];
  const selected = rows.find((r) => r.selected);
  const latestGen = rows[0]!.generation_id;
  const latest = rows.filter((r) => r.generation_id === latestGen);
  if (selected && selected.generation_id !== latestGen) {
    const others = latest.filter((r) => r.id !== selected.id);
    return [selected, ...others].slice(0, 6);
  }
  return latest;
}

async function toArtworkOptions(
  rows: ArtworkRow[],
  storage: DraftAssetStorage | undefined,
): Promise<TokenArtworkOption[]> {
  const out: TokenArtworkOption[] = [];
  for (const row of pickArtworkSet(rows)) {
    let previewUrl: string | undefined;
    if (storage) {
      previewUrl = await storage.createSignedPreviewUrl(row.storage_path, 3600);
    }
    out.push({
      id: row.style_id,
      style: row.style,
      mimeType: row.mime_type === 'image/webp' ? 'image/webp' : 'image/png',
      width: 1024,
      height: 1024,
      assetId: row.id,
      previewUrl,
      generation: {
        model: row.model,
        quality: row.quality,
      },
    });
  }
  return out;
}

async function mapDraft(
  db: Queryable,
  row: DraftRow,
  storage?: DraftAssetStorage,
): Promise<LaunchDraft> {
  const artRows = await loadArtworkRows(db, row.id);
  const artworks = await toArtworkOptions(artRows, storage);

  let source: LaunchDraft['source'];
  if (row.source_type === 'news' && row.provider && row.provider_article_id) {
    const article = await getNewsArticleForConcepts(
      db,
      row.provider_article_id,
      row.provider,
    );
    source = {
      provider: row.provider,
      providerArticleId: row.provider_article_id,
      headline: article?.headline ?? '(article unavailable)',
    };
  }

  return {
    id: row.id,
    sourceType: row.source_type,
    source,
    name: row.name,
    symbol: row.symbol,
    description: row.description,
    quote: {
      address: row.quote_asset_address,
      symbol: row.quote_asset_symbol,
    },
    artworks,
    selectedArtworkId: row.selected_artwork_asset_id,
    status: 'draft',
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function createNewsLaunchDraft(
  input: CreateNewsLaunchDraftInput,
  deps: DraftServiceDeps,
): Promise<LaunchDraft> {
  const article = await getNewsArticleForConcepts(
    deps.db,
    input.providerArticleId,
  );
  if (!article) {
    throw new ConceptValidationError(
      `Article not found: ${input.providerArticleId}`,
    );
  }

  const enabledQuotes = await getEnabledQuoteAssets(deps.db);
  const concept = revalidateLaunchConcept(input.concept, enabledQuotes);

  const result = await deps.db.query<{ id: string }>(
    `INSERT INTO launch_drafts (
       source_type, provider, provider_article_id,
       name, symbol, description,
       quote_asset_address, quote_asset_symbol,
       concept_image_direction, status
     ) VALUES (
       'news', $1, $2, $3, $4, $5, $6, $7, $8, 'draft'
     )
     RETURNING id`,
    [
      TIINGO_PROVIDER,
      article.providerArticleId,
      concept.name,
      concept.ticker,
      concept.description,
      concept.recommendedPairAddress,
      concept.recommendedPairSymbol,
      concept.imageDirection,
    ],
  );

  const id = result.rows[0]?.id;
  if (!id) throw new Error('Failed to create launch draft');
  return getLaunchDraft(id, deps);
}

export async function getLaunchDraft(
  draftId: string,
  deps: DraftServiceDeps,
): Promise<LaunchDraft> {
  const storage = deps.storage ?? createSupabaseDraftAssetStorage();
  const row = await loadDraftRow(deps.db, draftId);
  return mapDraft(deps.db, row, storage);
}

export async function generateDraftArtwork(
  draftId: string,
  deps: DraftServiceDeps,
): Promise<{
  draft: LaunchDraft;
  generationId: string;
  latencyMs: number;
  model: string;
  quality: string;
  imageCount: number;
}> {
  const storage = deps.storage ?? createSupabaseDraftAssetStorage();
  const row = await loadDraftRow(deps.db, draftId);
  if (row.status !== 'draft') {
    throw new ConceptValidationError('Draft is not editable');
  }
  if (row.source_type !== 'news' || !row.provider_article_id) {
    throw new ConceptValidationError('Draft has no news source article');
  }

  const article = await getNewsArticleForConcepts(
    deps.db,
    row.provider_article_id,
    row.provider ?? TIINGO_PROVIDER,
  );
  if (!article) {
    throw new ConceptValidationError('Source article missing for draft');
  }

  const enabledQuotes = await getEnabledQuoteAssets(deps.db);
  const concept: LaunchConcept = revalidateLaunchConcept(
    {
      id: 'concept_1',
      name: row.name,
      ticker: row.symbol,
      description: row.description,
      recommendedPairAddress: row.quote_asset_address,
      recommendedPairSymbol: row.quote_asset_symbol,
      pairRationale: 'Stored draft quote',
      imageDirection: row.concept_image_direction || row.description,
    },
    enabledQuotes,
  );

  const generationId = randomUUID();
  const generated = await generateTokenArtworkOptions({
    article,
    concept,
    callImage: deps.callImage,
    model: deps.imageModel,
    quality: deps.imageQuality,
  });

  for (const image of generated.images) {
    const path = buildArtworkStoragePath({
      providerArticleId: article.providerArticleId,
      generationId,
      styleId: image.id,
    });
    await storage.uploadArtwork({
      path,
      bytes: image.bytes,
      mimeType: image.mimeType,
    });

    await deps.db.query(
      `INSERT INTO launch_draft_artworks (
         draft_id, generation_id, style_id, style,
         storage_path, mime_type, width, height, model, quality, selected
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, FALSE)`,
      [
        draftId,
        generationId,
        image.id,
        image.style,
        path,
        image.mimeType,
        image.width,
        image.height,
        image.model,
        image.quality,
      ],
    );
  }

  await deps.db.query(
    `UPDATE launch_drafts SET updated_at = NOW() WHERE id = $1`,
    [draftId],
  );

  const draft = await getLaunchDraft(draftId, { ...deps, storage });
  return {
    draft,
    generationId,
    latencyMs: generated.latencyMs,
    model: generated.model,
    quality: generated.quality,
    imageCount: 3,
  };
}

export async function selectDraftArtwork(
  draftId: string,
  artworkId: string,
  deps: DraftServiceDeps,
): Promise<LaunchDraft> {
  if (!isUuid(draftId) || !isUuid(artworkId)) {
    throw new ConceptValidationError('Malformed draft or artwork id');
  }

  const art = await deps.db.query<ArtworkRow>(
    `SELECT * FROM launch_draft_artworks WHERE id = $1`,
    [artworkId],
  );
  const row = art.rows[0];
  if (!row || row.draft_id !== draftId) {
    throw new ConceptValidationError('Artwork does not belong to draft');
  }

  await deps.db.query(
    `UPDATE launch_draft_artworks SET selected = FALSE WHERE draft_id = $1`,
    [draftId],
  );
  await deps.db.query(
    `UPDATE launch_draft_artworks SET selected = TRUE WHERE id = $1 AND draft_id = $2`,
    [artworkId, draftId],
  );
  await deps.db.query(
    `UPDATE launch_drafts
     SET selected_artwork_asset_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [draftId, artworkId],
  );

  return getLaunchDraft(draftId, deps);
}

export async function updateLaunchDraft(
  draftId: string,
  patch: UpdateLaunchDraftPatch,
  deps: DraftServiceDeps,
): Promise<LaunchDraft> {
  const row = await loadDraftRow(deps.db, draftId);
  const nextName = patch.name ?? row.name;
  const nextSymbol = patch.symbol ?? row.symbol;
  const nextDescription = patch.description ?? row.description;
  const fields = validateDraftTextFields({
    name: nextName,
    symbol: nextSymbol,
    description: nextDescription,
  });

  let quoteAddress = row.quote_asset_address;
  let quoteSymbol = row.quote_asset_symbol;

  if (patch.quoteAssetAddress) {
    const enabled = await getEnabledQuoteAssets(deps.db);
    const match = enabled.find(
      (q) =>
        q.address.toLowerCase() === patch.quoteAssetAddress!.trim().toLowerCase(),
    );
    if (!match) {
      throw new ConceptValidationError(
        'Pair edit must use a currently enabled quote asset',
      );
    }
    quoteAddress = match.address;
    quoteSymbol = match.symbol;
  }

  await deps.db.query(
    `UPDATE launch_drafts
     SET name = $2,
         symbol = $3,
         description = $4,
         quote_asset_address = $5,
         quote_asset_symbol = $6,
         updated_at = NOW()
     WHERE id = $1`,
    [
      draftId,
      fields.name,
      fields.symbol,
      fields.description,
      quoteAddress,
      quoteSymbol,
    ],
  );

  return getLaunchDraft(draftId, deps);
}
