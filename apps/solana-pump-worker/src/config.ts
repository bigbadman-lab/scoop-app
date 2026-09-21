/**
 * Solana / Pump market-data worker config.
 * Default: SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false — idle, zero RPC/DB.
 *
 * Live trade source (Phase 6): PumpPortal Data API.
 */

import { z } from 'zod';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';

export type PumpTradeProviderKind = 'mock' | 'pumpportal';

export type SolanaPumpWorkerConfig = {
  indexingEnabled: boolean;
  chainId: typeof SOLANA_MAINNET_CHAIN_ID;
  databaseUrl: string | null;
  tradeProvider: PumpTradeProviderKind;
  /** Present only for pumpportal — never logged via publicConfigView. */
  pumpPortalApiKey: string | null;
  watchlistRefreshMs: number;
  reconnectBackoffMs: number;
  maxReconnectBackoffMs: number;
};

export type PublicSolanaPumpWorkerConfig = {
  indexingEnabled: boolean;
  chainId: number;
  tradeProvider: PumpTradeProviderKind;
  watchlistRefreshMs: number;
  hasDatabaseUrl: boolean;
  hasPumpPortalApiKey: boolean;
};

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  throw new Error(`Invalid boolean env value: ${raw}`);
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return n;
}

const providerSchema = z.enum(['mock', 'pumpportal']);

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): SolanaPumpWorkerConfig {
  const indexingEnabled = parseBool(env.SCOOP_SOLANA_PUMP_INDEXING_ENABLED, false);
  const providerRaw = (env.SCOOP_SOLANA_PUMP_TRADE_PROVIDER ?? 'mock').trim().toLowerCase();
  const tradeProvider = providerSchema.parse(providerRaw);

  const databaseUrl = env.DATABASE_URL?.trim() || null;
  if (indexingEnabled && !databaseUrl) {
    throw new Error('DATABASE_URL is required when SCOOP_SOLANA_PUMP_INDEXING_ENABLED=true');
  }

  const pumpPortalApiKey = env.PUMPPORTAL_API_KEY?.trim() || null;
  if (indexingEnabled && tradeProvider === 'pumpportal' && !pumpPortalApiKey) {
    throw new Error('PUMPPORTAL_API_KEY is required when trade provider is pumpportal');
  }

  return {
    indexingEnabled,
    chainId: SOLANA_MAINNET_CHAIN_ID,
    databaseUrl,
    tradeProvider,
    pumpPortalApiKey,
    watchlistRefreshMs: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_WATCHLIST_REFRESH_MS,
      45_000,
      'SCOOP_SOLANA_PUMP_WATCHLIST_REFRESH_MS',
    ),
    reconnectBackoffMs: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_RECONNECT_BACKOFF_MS,
      2_000,
      'SCOOP_SOLANA_PUMP_RECONNECT_BACKOFF_MS',
    ),
    maxReconnectBackoffMs: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_MAX_RECONNECT_BACKOFF_MS,
      60_000,
      'SCOOP_SOLANA_PUMP_MAX_RECONNECT_BACKOFF_MS',
    ),
  };
}

export function publicConfigView(config: SolanaPumpWorkerConfig): PublicSolanaPumpWorkerConfig {
  return {
    indexingEnabled: config.indexingEnabled,
    chainId: config.chainId,
    tradeProvider: config.tradeProvider,
    watchlistRefreshMs: config.watchlistRefreshMs,
    hasDatabaseUrl: Boolean(config.databaseUrl),
    hasPumpPortalApiKey: Boolean(config.pumpPortalApiKey),
  };
}
