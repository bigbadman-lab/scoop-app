import type { Queryable } from '../types.js';
import { normalizeAddress, toNumericString } from '../hex.js';

export interface TokenRow {
  chainId: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupplyRaw: string | bigint;
  imageUri?: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
  farcaster?: string;
  deployerAddress: string;
  launchFactoryAddress: string;
  contractUri?: string | null;
  metadataSourceBlock?: number | bigint | null;
}

export async function upsertToken(db: Queryable, row: TokenRow): Promise<void> {
  await db.query(
    `INSERT INTO tokens (
      chain_id, token_address, name, symbol, decimals, total_supply_raw,
      image_uri, description, twitter, telegram, discord, website, farcaster,
      deployer_address, launch_factory_address, contract_uri, metadata_source_block
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
      name = EXCLUDED.name,
      symbol = EXCLUDED.symbol,
      decimals = EXCLUDED.decimals,
      total_supply_raw = EXCLUDED.total_supply_raw,
      image_uri = EXCLUDED.image_uri,
      description = EXCLUDED.description,
      twitter = EXCLUDED.twitter,
      telegram = EXCLUDED.telegram,
      discord = EXCLUDED.discord,
      website = EXCLUDED.website,
      farcaster = EXCLUDED.farcaster,
      deployer_address = EXCLUDED.deployer_address,
      launch_factory_address = EXCLUDED.launch_factory_address,
      contract_uri = EXCLUDED.contract_uri,
      metadata_source_block = EXCLUDED.metadata_source_block,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      row.name,
      row.symbol,
      row.decimals,
      toNumericString(row.totalSupplyRaw),
      row.imageUri ?? '',
      row.description ?? '',
      row.twitter ?? '',
      row.telegram ?? '',
      row.discord ?? '',
      row.website ?? '',
      row.farcaster ?? '',
      normalizeAddress(row.deployerAddress),
      normalizeAddress(row.launchFactoryAddress),
      row.contractUri ?? null,
      row.metadataSourceBlock == null ? null : toNumericString(row.metadataSourceBlock),
    ],
  );
}

/**
 * Set SCOOP display HTTPS URL without touching canonical image_uri.
 * Ownership: launch finalization / ops backfill — not the chain indexer.
 * Idempotent when the token already has the same URL.
 */
export async function setTokenDisplayImageUrl(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    displayImageUrl: string;
  },
): Promise<'applied' | 'skipped'> {
  const url = input.displayImageUrl.trim();
  if (!url || !/^https:\/\//i.test(url)) {
    throw new Error('displayImageUrl must be an https URL');
  }
  if (/^(javascript|data|file|blob):/i.test(url)) {
    throw new Error('Unsafe displayImageUrl scheme');
  }
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const existing = await db.query<{ display_image_url: string | null }>(
    `SELECT display_image_url FROM tokens
     WHERE chain_id = $1 AND token_address = $2
     LIMIT 1`,
    [input.chainId, tokenAddress],
  );
  const current = String(existing.rows[0]?.display_image_url ?? '').trim();
  if (current === url) {
    return 'skipped';
  }
  await db.query(
    `UPDATE tokens
     SET display_image_url = $3,
         updated_at = NOW()
     WHERE chain_id = $1 AND token_address = $2`,
    [input.chainId, tokenAddress, url],
  );
  return 'applied';
}

/**
 * After token address is known, copy selected draft artwork display URL onto tokens.
 * Returns false when no display copy exists (IPFS fallback remains valid).
 * Idempotent when tokens.display_image_url already matches.
 */
export async function applyDraftDisplayImageToToken(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    draftId: string;
  },
): Promise<boolean> {
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const launch = await db.query(
    `SELECT 1 FROM launches WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [input.chainId, tokenAddress],
  );
  if (!launch.rows[0]) {
    return false;
  }

  const result = await db.query<{ display_image_url: string | null }>(
    `SELECT a.display_image_url
     FROM launch_drafts d
     INNER JOIN launch_draft_artworks a
       ON a.id = d.selected_artwork_asset_id
     WHERE d.id = $1
     LIMIT 1`,
    [input.draftId],
  );
  const displayUrl = String(result.rows[0]?.display_image_url ?? '').trim();
  if (!displayUrl) return false;
  await setTokenDisplayImageUrl(db, {
    chainId: input.chainId,
    tokenAddress,
    displayImageUrl: displayUrl,
  });
  return true;
}

/**
 * Apply a server-trusted token-image object path to an indexed token.
 * Caller must validate path allowlist and derive HTTPS URL server-side.
 */
export async function applyDisplayImagePathToToken(
  db: Queryable,
  input: {
    chainId: number;
    tokenAddress: string;
    displayImageUrl: string;
  },
): Promise<'applied' | 'skipped' | 'missing_token'> {
  const tokenAddress = normalizeAddress(input.tokenAddress);
  const launch = await db.query(
    `SELECT 1 FROM launches WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [input.chainId, tokenAddress],
  );
  if (!launch.rows[0]) {
    return 'missing_token';
  }
  const token = await db.query(
    `SELECT 1 FROM tokens WHERE chain_id = $1 AND token_address = $2 LIMIT 1`,
    [input.chainId, tokenAddress],
  );
  if (!token.rows[0]) {
    return 'missing_token';
  }
  return setTokenDisplayImageUrl(db, {
    chainId: input.chainId,
    tokenAddress,
    displayImageUrl: input.displayImageUrl,
  });
}
