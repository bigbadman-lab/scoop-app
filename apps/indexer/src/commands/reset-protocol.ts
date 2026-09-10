/**
 * Safe protocol-derived reindex/reset tooling.
 *
 * Default: dry-run (prints row counts; no deletes).
 * Destructive apply requires ALL of:
 *   SCOOP_ALLOW_PROTOCOL_RESET=true
 *   --apply
 *   --mode historical-test | canonical-production
 *   --chain-id 4663
 *
 * Never silently targets production. Never falls back to historical Factory
 * when mode=canonical-production.
 *
 * Usage:
 *   pnpm reset:protocol -- --mode historical-test --chain-id 4663
 *   pnpm reset:protocol -- --mode historical-test --chain-id 4663 --apply
 *   pnpm reset:protocol -- --mode canonical-production --chain-id 4663
 *
 * Future reindex after canonical redeploy:
 *   1) apply migration
 *   2) pnpm reset:protocol -- --mode canonical-production --chain-id 4663 --apply
 *   3) set indexer start block to canonical indexingStartBlock
 *   4) pnpm indexer:catchup / indexer:start
 */

import {
  createPool,
  withTransaction,
  type Queryable,
} from '@scoop/db';
import {
  CANONICAL_CHAIN_ID,
  canonicalProductionManifest,
  historicalTestCanaryManifest,
  isCanonicalProductionDeployed,
  requireCanonicalProductionAddresses,
} from '@scoop/contracts';
import { loadConfig } from '../config.js';

export type ProtocolResetMode = 'historical-test' | 'canonical-production';

export interface ProtocolResetOptions {
  mode: ProtocolResetMode;
  chainId: number;
  apply: boolean;
  allowEnv: boolean;
}

const PROTOCOL_FACT_TABLES = [
  'holder_reward_payouts',
  'holder_reward_deposits',
  'holder_reward_rounds',
  'fee_distributions',
  'creator_claims',
  'creator_credits',
  'creator_claimable_state',
  'candles',
  'token_market_state',
  'holder_balances',
  'transfers',
  'trades',
  'pools',
  'launches',
  'tokens',
  'raw_chain_events',
  'processed_blocks',
  'indexer_checkpoints',
] as const;

/** Tables that are never wiped by this tool (user/account/news). */
const PRESERVED_TABLES = [
  'scoop_users',
  'scoop_wallets',
  'scoop_profiles',
  'news_articles',
  'news_article_markets',
  'launch_drafts',
] as const;

export function parseProtocolResetArgs(argv: string[]): ProtocolResetOptions {
  const modeIdx = argv.indexOf('--mode');
  const chainIdx = argv.indexOf('--chain-id');
  const mode = argv[modeIdx + 1] as ProtocolResetMode | undefined;
  const chainRaw = argv[chainIdx + 1];
  const apply = argv.includes('--apply');
  if (mode !== 'historical-test' && mode !== 'canonical-production') {
    throw new Error('Required: --mode historical-test | canonical-production');
  }
  if (!chainRaw || !/^\d+$/.test(chainRaw)) {
    throw new Error('Required: --chain-id <number>');
  }
  const chainId = Number(chainRaw);
  if (chainId !== CANONICAL_CHAIN_ID) {
    throw new Error(`Only chain ${CANONICAL_CHAIN_ID} is supported`);
  }
  return {
    mode,
    chainId,
    apply,
    allowEnv: process.env.SCOOP_ALLOW_PROTOCOL_RESET === 'true',
  };
}

export async function countProtocolRows(
  db: Queryable,
  chainId: number,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of PROTOCOL_FACT_TABLES) {
    const result = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM ${table} WHERE chain_id = $1`,
      [chainId],
    );
    out[table] = Number(result.rows[0]?.n ?? 0);
  }
  return out;
}

export async function deleteProtocolRows(
  db: Queryable,
  chainId: number,
): Promise<void> {
  // Order: dependents first. address_classifications kept for global seeds;
  // per-launch classes (related_token != '') are cleared.
  for (const table of [
    'holder_reward_payouts',
    'holder_reward_deposits',
    'holder_reward_rounds',
    'fee_distributions',
    'creator_claims',
    'creator_credits',
    'creator_claimable_state',
    'candles',
    'token_market_state',
    'holder_balances',
    'transfers',
    'trades',
    'pools',
    'launches',
    'tokens',
    'raw_chain_events',
    'processed_blocks',
    'indexer_checkpoints',
  ] as const) {
    await db.query(`DELETE FROM ${table} WHERE chain_id = $1`, [chainId]);
  }
  await db.query(
    `DELETE FROM address_classifications
     WHERE chain_id = $1 AND related_token <> ''`,
    [chainId],
  );
  await db.query(
    `UPDATE indexer_health
     SET latest_indexed_block = NULL,
         notes = 'protocol reset — awaiting reindex',
         updated_at = NOW()
     WHERE chain_id = $1`,
    [chainId],
  );
}

export async function runProtocolReset(opts: ProtocolResetOptions): Promise<{
  dryRun: boolean;
  mode: ProtocolResetMode;
  chainId: number;
  counts: Record<string, number>;
  preserved: readonly string[];
  deployment: Record<string, unknown>;
}> {
  if (opts.mode === 'canonical-production') {
    if (!isCanonicalProductionDeployed(canonicalProductionManifest)) {
      throw new Error(
        'Canonical production is undeployed; refusing reset that would imply production is live. Use --mode historical-test for HELLO/canary cleanup.',
      );
    }
    // Ensures we never treat historical Factory as production.
    requireCanonicalProductionAddresses(canonicalProductionManifest);
  }

  const deployment =
    opts.mode === 'historical-test'
      ? {
          kind: historicalTestCanaryManifest.deploymentKind,
          factory: historicalTestCanaryManifest.contracts.ScoopFactory,
          baseline: historicalTestCanaryManifest.baseline,
        }
      : {
          kind: canonicalProductionManifest.deploymentKind,
          status: canonicalProductionManifest.status,
          factory: isCanonicalProductionDeployed(canonicalProductionManifest)
            ? canonicalProductionManifest.contracts.factory
            : null,
        };

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for protocol reset');
  }

  const pool = createPool(config.DATABASE_URL);
  try {
    const counts = await withTransaction(pool, async (db) => {
      const before = await countProtocolRows(db, opts.chainId);
      if (opts.apply) {
        if (!opts.allowEnv) {
          throw new Error(
            'Refusing destructive reset — set SCOOP_ALLOW_PROTOCOL_RESET=true and pass --apply',
          );
        }
        await deleteProtocolRows(db, opts.chainId);
      }
      return before;
    });

    return {
      dryRun: !opts.apply,
      mode: opts.mode,
      chainId: opts.chainId,
      counts,
      preserved: PRESERVED_TABLES,
      deployment,
    };
  } finally {
    await pool.end();
  }
}
