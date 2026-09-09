import { z } from 'zod';
import { SCOOP_CHAIN_ID, NEW_MARKET_WINDOW_SECONDS } from '@scoop/shared';

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === '') return false;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    throw new Error(`Invalid boolean env value: ${value}`);
  });

const optionalPositiveInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(`Invalid non-negative integer: ${value}`);
    }
    return n;
  });

/** Positive integer env with a default; rejects zero/negative/non-integer. */
function positiveIntWithDefault(defaultValue: number) {
  return z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        throw new Error(`Invalid positive integer: ${value}`);
      }
      return n;
    });
}

const indexerEnvSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    SCOOP_CHAIN_ID: z.coerce.number().int().default(SCOOP_CHAIN_ID),
    SCOOP_INDEXING_ENABLED: boolFromEnv,
    SCOOP_START_BLOCK: z.coerce.number().int().positive().default(55863290),
    SCOOP_CONFIRM_MODE: z.enum(['safe', 'latest', 'finalized']).default('safe'),
    SCOOP_CONFIRM_LAG_BLOCKS: z.coerce.number().int().nonnegative().optional(),
    SCOOP_NEW_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(NEW_MARKET_WINDOW_SECONDS),
    SCOOP_SOON_THRESHOLD_BPS: z.coerce.number().int().min(0).max(10000).default(8000),
    SCOOP_REORG_WINDOW_BLOCKS: z.coerce.number().int().positive().default(128),
    SCOOP_QUOTE_SNAPSHOT_SECONDS: z.coerce.number().int().positive().default(60),
    /** Max age of quote_price_snapshots before USD/FDV fields are nulled. */
    SCOOP_QUOTE_USD_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(300),
    SCOOP_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
    SCOOP_MAX_BLOCK_BATCH: z.coerce.number().int().positive().default(20),
    /** Enter fast historical catch-up when lag (safe - next) exceeds this. */
    SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS: z.coerce.number().int().nonnegative().default(5000),
    /** Max eth_getLogs window size while in fast catch-up (auto-shrinks on reject). */
    SCOOP_FAST_CATCHUP_RANGE: z.coerce.number().int().positive().default(5000),
    /** Sparse processed_blocks anchor spacing over empty ranges. */
    SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS: z.coerce.number().int().positive().default(64),
    SCOOP_LAUNCH_DUST_RAW: z.coerce.bigint().default(1000n),
    SCOOP_INDEX_TO_BLOCK: optionalPositiveInt,
    ROBINHOOD_RPC_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
    ROBINHOOD_WS_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
    ROBINHOOD_FALLBACK_RPC_URL: z
      .string()
      .url()
      .default('https://rpc.mainnet.chain.robinhood.com'),
    DATABASE_URL: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
    /**
     * Direct/non-pooled Postgres URL used only for the indexer singleton advisory lock.
     * Required in production when indexing is enabled — never the Supavisor pooler URL.
     */
    INDEXER_LOCK_DATABASE_URL: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
    INDEXER_LOCK_RETRY_MS: positiveIntWithDefault(5000),
    INDEXER_LOCK_WAIT_TIMEOUT_MS: positiveIntWithDefault(120_000),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .optional()
      .or(z.literal(''))
      .transform((v) => v || undefined),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.SCOOP_CHAIN_ID !== SCOOP_CHAIN_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SCOOP_CHAIN_ID'],
        message: `SCOOP_CHAIN_ID must be ${SCOOP_CHAIN_ID}`,
      });
    }

    if (env.SCOOP_INDEXING_ENABLED) {
      if (!env.ROBINHOOD_RPC_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ROBINHOOD_RPC_URL'],
          message: 'ROBINHOOD_RPC_URL is required when SCOOP_INDEXING_ENABLED=true',
        });
      }
      if (!env.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL is required when SCOOP_INDEXING_ENABLED=true',
        });
      }
      // Production must not silently fall back to a pooled DATABASE_URL for the lock.
      if (env.NODE_ENV === 'production' && !env.INDEXER_LOCK_DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INDEXER_LOCK_DATABASE_URL'],
          message:
            'INDEXER_LOCK_DATABASE_URL is required when SCOOP_INDEXING_ENABLED=true in production (use Supabase direct/non-pooled Postgres URL)',
        });
      }
    }
  });

export type IndexerConfig = z.infer<typeof indexerEnvSchema>;

export const MAIN_STREAM_NAME = 'main';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IndexerConfig {
  const parsed = indexerEnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid indexer configuration: ${details}`);
  }
  return parsed.data;
}

/**
 * Resolve the dedicated lock connection URL.
 * Production never falls back to pooled DATABASE_URL (enforced in loadConfig).
 * Non-production may fall back to DATABASE_URL for local/dev convenience.
 */
export function resolveIndexerLockDatabaseUrl(config: IndexerConfig): string {
  if (config.INDEXER_LOCK_DATABASE_URL) {
    return config.INDEXER_LOCK_DATABASE_URL;
  }
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'INDEXER_LOCK_DATABASE_URL is required in production (Supabase direct/non-pooled Postgres URL)',
    );
  }
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for indexer lock fallback outside production');
  }
  return config.DATABASE_URL;
}

/** Redacted view for startup logs — never includes secrets. */
export function publicConfigView(config: IndexerConfig) {
  return {
    chainId: config.SCOOP_CHAIN_ID,
    indexingEnabled: config.SCOOP_INDEXING_ENABLED,
    startBlock: config.SCOOP_START_BLOCK,
    confirmMode: config.SCOOP_CONFIRM_MODE,
    confirmLagBlocks: config.SCOOP_CONFIRM_LAG_BLOCKS ?? null,
    newWindowSeconds: config.SCOOP_NEW_WINDOW_SECONDS,
    soonThresholdBps: config.SCOOP_SOON_THRESHOLD_BPS,
    reorgWindowBlocks: config.SCOOP_REORG_WINDOW_BLOCKS,
    quoteSnapshotSeconds: config.SCOOP_QUOTE_SNAPSHOT_SECONDS,
    quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
    pollIntervalMs: config.SCOOP_POLL_INTERVAL_MS,
    maxBlockBatch: config.SCOOP_MAX_BLOCK_BATCH,
    fastCatchupThresholdBlocks: config.SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS,
    fastCatchupRange: config.SCOOP_FAST_CATCHUP_RANGE,
    fastCatchupAnchorBlocks: config.SCOOP_FAST_CATCHUP_ANCHOR_BLOCKS,
    launchDustRaw: config.SCOOP_LAUNCH_DUST_RAW.toString(),
    indexToBlock: config.SCOOP_INDEX_TO_BLOCK ?? null,
    hasPrimaryRpc: Boolean(config.ROBINHOOD_RPC_URL),
    hasWsRpc: Boolean(config.ROBINHOOD_WS_URL),
    fallbackRpc: config.ROBINHOOD_FALLBACK_RPC_URL,
    hasDatabaseUrl: Boolean(config.DATABASE_URL),
    hasIndexerLockDatabaseUrl: Boolean(config.INDEXER_LOCK_DATABASE_URL),
    indexerLockRetryMs: config.INDEXER_LOCK_RETRY_MS,
    indexerLockWaitTimeoutMs: config.INDEXER_LOCK_WAIT_TIMEOUT_MS,
    hasServiceRoleKey: Boolean(config.SUPABASE_SERVICE_ROLE_KEY),
    logLevel: config.LOG_LEVEL,
  };
}

/** Sanitize RPC URL for logs (host only). */
export function sanitizeRpcLabel(url: string | undefined): string {
  if (!url) return 'none';
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'invalid-url';
  }
}
