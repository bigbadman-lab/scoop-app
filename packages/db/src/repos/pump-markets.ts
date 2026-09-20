/**
 * Pump / Solana market persistence (Gate E).
 * Does NOT call EVM normalizeAddress / normalizeBytes32.
 * Constants mirrored from @scoop/shared chainIds (keep in sync).
 */

import type { Queryable } from '../types.js';
import { toNumericString } from '../hex.js';

/** Keep in sync with @scoop/shared SOLANA_MAINNET_CHAIN_ID. */
export const SOLANA_MAINNET_CHAIN_ID = 900001 as const;
const SOLANA_WSOL_MINT = 'So11111111111111111111111111111111111111112';
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_DEFAULT_TOTAL_SUPPLY_RAW = '1000000000000000';
const PUMP_TOKEN_DECIMALS = 6;

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;

function normalizeSolanaAddress(raw: string, label: string): string {
  const t = raw.trim();
  if (!SOLANA_BASE58_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana ${label}: ${raw}`);
  }
  return t;
}

function normalizeSolanaSignature(raw: string): string {
  const t = raw.trim();
  if (!SOLANA_SIG_RE.test(t) || t.startsWith('0x')) {
    throw new Error(`Invalid Solana signature: ${raw}`);
  }
  return t;
}

export type PumpMarketPersistInput = {
  mint: string;
  signature: string;
  creatorWallet: string;
  name: string;
  symbol: string;
  description?: string;
  imageUri?: string;
  metadataUri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  launchedAt?: number;
  launchSlot?: number | null;
};

export type PumpMarketPersistResult = {
  chainId: typeof SOLANA_MAINNET_CHAIN_ID;
  mint: string;
  signature: string;
  marketSource: 'pump';
  created: boolean;
};

export async function upsertPumpMarket(
  db: Queryable,
  input: PumpMarketPersistInput,
): Promise<PumpMarketPersistResult> {
  const mint = normalizeSolanaAddress(input.mint, 'mint');
  const creator = normalizeSolanaAddress(input.creatorWallet, 'creatorWallet');
  const signature = normalizeSolanaSignature(input.signature);
  const name = input.name.trim();
  const symbol = input.symbol.trim();
  if (!name || !symbol) {
    throw new Error('Pump market requires name and symbol');
  }

  const chainId = SOLANA_MAINNET_CHAIN_ID;
  const imageUri = (input.imageUri ?? input.metadataUri ?? '').trim();
  const contractUri = (input.metadataUri ?? imageUri).trim() || null;
  const launchedAt =
    input.launchedAt != null && Number.isFinite(input.launchedAt)
      ? Math.floor(input.launchedAt)
      : Math.floor(Date.now() / 1000);
  const launchBlock =
    input.launchSlot != null && Number.isFinite(input.launchSlot)
      ? Math.floor(input.launchSlot)
      : 0;

  const existing = await db.query<{
    launch_tx_hash: string;
  }>(
    `SELECT launch_tx_hash FROM launches
     WHERE chain_id = $1 AND token_address = $2 AND market_source = 'pump'
     LIMIT 1`,
    [chainId, mint],
  );
  if (existing.rows[0]) {
    const prior = existing.rows[0].launch_tx_hash;
    if (prior !== signature) {
      throw new Error(
        `Pump mint already persisted with a different launch signature (${prior})`,
      );
    }
    return {
      chainId,
      mint,
      signature,
      marketSource: 'pump',
      created: false,
    };
  }

  const bySig = await db.query<{ token_address: string }>(
    `SELECT token_address FROM launches
     WHERE chain_id = $1 AND launch_tx_hash = $2 AND market_source = 'pump'
     LIMIT 1`,
    [chainId, signature],
  );
  if (bySig.rows[0] && bySig.rows[0].token_address !== mint) {
    throw new Error(
      `Pump signature already persisted for mint ${bySig.rows[0].token_address}`,
    );
  }

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
      website = EXCLUDED.website,
      deployer_address = EXCLUDED.deployer_address,
      launch_factory_address = EXCLUDED.launch_factory_address,
      contract_uri = EXCLUDED.contract_uri,
      updated_at = NOW()`,
    [
      chainId,
      mint,
      name,
      symbol,
      PUMP_TOKEN_DECIMALS,
      PUMP_DEFAULT_TOTAL_SUPPLY_RAW,
      imageUri,
      (input.description ?? '').trim(),
      (input.twitter ?? '').trim(),
      (input.telegram ?? '').trim(),
      '',
      (input.website ?? '').trim(),
      '',
      creator,
      PUMP_PROGRAM_ID,
      contractUri,
      null,
    ],
  );

  await db.query(
    `INSERT INTO launches (
      chain_id, token_address, factory_address, deployer_address, creator_id, quote_asset,
      fee_distributor_address, liquidity_locker_address, pool_id, lp_token_id,
      opening_sqrt_price_x96, opening_tick, tick_lower, tick_upper,
      launch_tx_hash, launch_block, launch_log_index, launched_at, launch_fee_raw,
      initial_buy_present, initial_buy_quote_raw, initial_buy_tokens_raw, metadata_hydrated,
      additional_fee, total_pool_fee, creator_allocation_destination, additional_fee_destination,
      holder_rewards_address,
      market_source, curve_address, launch_config_id, graduation_threshold_raw, graduation_status
    ) VALUES (
      $1,$2,$3,$4,$5,$6,
      NULL,NULL,NULL,NULL,
      NULL,NULL,NULL,NULL,
      $7,$8,0,$9,0,
      FALSE,NULL,NULL,TRUE,
      0,0,0,0,
      NULL,
      'pump',NULL,NULL,NULL,NULL
    )
    ON CONFLICT (chain_id, token_address) DO UPDATE SET
      factory_address = EXCLUDED.factory_address,
      deployer_address = EXCLUDED.deployer_address,
      creator_id = EXCLUDED.creator_id,
      quote_asset = EXCLUDED.quote_asset,
      launch_tx_hash = EXCLUDED.launch_tx_hash,
      launch_block = EXCLUDED.launch_block,
      launched_at = EXCLUDED.launched_at,
      metadata_hydrated = TRUE,
      market_source = 'pump',
      additional_fee = 0,
      total_pool_fee = 0,
      updated_at = NOW()`,
    [
      chainId,
      mint,
      PUMP_PROGRAM_ID,
      creator,
      creator,
      SOLANA_WSOL_MINT,
      signature,
      toNumericString(launchBlock),
      toNumericString(launchedAt),
    ],
  );

  return {
    chainId,
    mint,
    signature,
    marketSource: 'pump',
    created: true,
  };
}
