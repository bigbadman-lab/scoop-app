/**
 * Solana / Pump market-data worker config.
 * Default: SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false — idle, zero RPC/DB.
 *
 * Live trade source: Alchemy via SOLANA_RPC_URL.
 */

import { z } from 'zod';
import { SOLANA_MAINNET_CHAIN_ID } from '@scoop/shared';

export type PumpTradeProviderKind = 'mock' | 'alchemy';

export type SolanaPumpWorkerConfig = {
  indexingEnabled: boolean;
  chainId: typeof SOLANA_MAINNET_CHAIN_ID;
  databaseUrl: string | null;
  tradeProvider: PumpTradeProviderKind;
  /** Alchemy / Solana HTTPS RPC — never logged via publicConfigView. */
  solanaRpcUrl: string | null;
  watchlistRefreshMs: number;
  reconnectBackoffMs: number;
  maxReconnectBackoffMs: number;
  reconcileIntervalMs: number;
  reconcileLimit: number;
  /** Periodic Alchemy holder enumeration cadence (default 3 minutes). */
  holderRefreshMs: number;
};

export type PublicSolanaPumpWorkerConfig = {
  indexingEnabled: boolean;
  chainId: number;
  tradeProvider: PumpTradeProviderKind;
  watchlistRefreshMs: number;
  holderRefreshMs: number;
  hasDatabaseUrl: boolean;
  hasSolanaRpcUrl: boolean;
  solanaRpcProvider: 'alchemy' | 'other' | null;
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

const providerSchema = z.enum(['mock', 'alchemy']);

function classifyRpcProvider(rpcUrl: string | null): 'alchemy' | 'other' | null {
  if (!rpcUrl) return null;
  try {
    return new URL(rpcUrl).hostname.toLowerCase().includes('alchemy') ? 'alchemy' : 'other';
  } catch {
    return 'other';
  }
}

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

  const solanaRpcUrl = env.SOLANA_RPC_URL?.trim() || null;
  if (indexingEnabled && tradeProvider === 'alchemy' && !solanaRpcUrl) {
    throw new Error('SOLANA_RPC_URL is required when trade provider is alchemy');
  }

  return {
    indexingEnabled,
    chainId: SOLANA_MAINNET_CHAIN_ID,
    databaseUrl,
    tradeProvider,
    solanaRpcUrl,
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
    reconcileIntervalMs: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_RECONCILE_INTERVAL_MS,
      60_000,
      'SCOOP_SOLANA_PUMP_RECONCILE_INTERVAL_MS',
    ),
    reconcileLimit: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_RECONCILE_LIMIT,
      80,
      'SCOOP_SOLANA_PUMP_RECONCILE_LIMIT',
    ),
    holderRefreshMs: parsePositiveInt(
      env.SCOOP_SOLANA_PUMP_HOLDER_REFRESH_MS,
      180_000,
      'SCOOP_SOLANA_PUMP_HOLDER_REFRESH_MS',
    ),
  };
}

export function publicConfigView(config: SolanaPumpWorkerConfig): PublicSolanaPumpWorkerConfig {
  return {
    indexingEnabled: config.indexingEnabled,
    chainId: config.chainId,
    tradeProvider: config.tradeProvider,
    watchlistRefreshMs: config.watchlistRefreshMs,
    holderRefreshMs: config.holderRefreshMs,
    hasDatabaseUrl: Boolean(config.databaseUrl),
    hasSolanaRpcUrl: Boolean(config.solanaRpcUrl),
    solanaRpcProvider: classifyRpcProvider(config.solanaRpcUrl),
  };
}
