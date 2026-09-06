import { z } from 'zod';
import { SCOOP_CHAIN_ID } from '@scoop/shared';

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

const indexerEnvSchema = z
  .object({
    SCOOP_CHAIN_ID: z.coerce.number().int().default(SCOOP_CHAIN_ID),
    SCOOP_INDEXING_ENABLED: boolFromEnv,
    SCOOP_START_BLOCK: z.coerce.number().int().positive().default(55863290),
    SCOOP_CONFIRM_MODE: z.enum(['safe', 'latest', 'finalized']).default('safe'),
    SCOOP_CONFIRM_LAG_BLOCKS: z.coerce.number().int().nonnegative().optional(),
    ROBINHOOD_RPC_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
    ROBINHOOD_WS_URL: z.string().url().optional().or(z.literal('')).transform((v) => v || undefined),
    ROBINHOOD_FALLBACK_RPC_URL: z
      .string()
      .url()
      .default('https://rpc.mainnet.chain.robinhood.com'),
    DATABASE_URL: z.string().optional().or(z.literal('')).transform((v) => v || undefined),
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
      if (!env.DATABASE_URL && !env.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message:
            'DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY is required when SCOOP_INDEXING_ENABLED=true',
        });
      }
    }
  });

export type IndexerConfig = z.infer<typeof indexerEnvSchema>;

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

/** Redacted view for startup logs — never includes secrets. */
export function publicConfigView(config: IndexerConfig) {
  return {
    chainId: config.SCOOP_CHAIN_ID,
    indexingEnabled: config.SCOOP_INDEXING_ENABLED,
    startBlock: config.SCOOP_START_BLOCK,
    confirmMode: config.SCOOP_CONFIRM_MODE,
    confirmLagBlocks: config.SCOOP_CONFIRM_LAG_BLOCKS ?? null,
    hasPrimaryRpc: Boolean(config.ROBINHOOD_RPC_URL),
    hasWsRpc: Boolean(config.ROBINHOOD_WS_URL),
    fallbackRpc: config.ROBINHOOD_FALLBACK_RPC_URL,
    hasDatabaseUrl: Boolean(config.DATABASE_URL),
    hasServiceRoleKey: Boolean(config.SUPABASE_SERVICE_ROLE_KEY),
    logLevel: config.LOG_LEVEL,
  };
}
