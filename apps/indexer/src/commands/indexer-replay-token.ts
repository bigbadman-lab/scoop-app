import { createPool } from '@scoop/db';
import { HELLO_FIXTURE, normalizeAddress } from '@scoop/shared';
import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { enrichTokenHistoricalUsd, parseTradeTimestampSec } from '../live/projections/enrichTokenUsd.js';
import { backfillHistoricalQuoteSnapshots } from '../live/oracle/backfillQuoteHistory.js';

loadLocalEnv();

function parseArgs(argv: string[]): {
  token: string;
  dryRun: boolean;
  help: boolean;
  skipOracleBackfill: boolean;
} {
  let token: string = HELLO_FIXTURE.token;
  let dryRun = false;
  let help = false;
  let skipOracleBackfill = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--dry-run' || arg === '--inspect') {
      dryRun = true;
      continue;
    }
    if (arg === '--skip-oracle-backfill') {
      skipOracleBackfill = true;
      continue;
    }
    if (arg === '--token') {
      const next = argv[i + 1];
      if (!next) throw new Error('--token requires an address');
      token = normalizeAddress(next);
      i += 1;
      continue;
    }
    if (arg.startsWith('--token=')) {
      token = normalizeAddress(arg.slice('--token='.length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { token, dryRun, help, skipOracleBackfill };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:replay:token usage',
        usage:
          'pnpm indexer:replay:token [--token 0x...] [--dry-run] [--skip-oracle-backfill]  # defaults to HELLO; optional AggregatorV3 historical snapshot backfill then DB-only USD enrich; does not move main checkpoint',
      }),
    );
    return;
  }

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const started = Date.now();
  const pool = createPool(config.DATABASE_URL);
  try {
    // Load trade timestamps for optional historical oracle backfill (token-scoped).
    if (!args.skipOracleBackfill) {
      if (!config.ROBINHOOD_RPC_URL) {
        throw new Error(
          'ROBINHOOD_RPC_URL is required for historical AggregatorV3 backfill (or pass --skip-oracle-backfill)',
        );
      }
      const launch = await pool.query<{ quote_asset: string }>(
        `SELECT quote_asset FROM launches WHERE chain_id = $1 AND token_address = $2`,
        [config.SCOOP_CHAIN_ID, args.token],
      );
      const quoteAsset = launch.rows[0]?.quote_asset;
      if (!quoteAsset) {
        throw new Error(`No launch row for token ${args.token}`);
      }
      const tradeTs = await pool.query<{ block_timestamp: string }>(
        `SELECT block_timestamp::text AS block_timestamp
         FROM trades
         WHERE chain_id = $1 AND token_address = $2
         ORDER BY block_number ASC, log_index ASC`,
        [config.SCOOP_CHAIN_ID, args.token],
      );
      const timestamps = tradeTs.rows.map((r) => parseTradeTimestampSec(r.block_timestamp));
      const backfill = await backfillHistoricalQuoteSnapshots({
        db: pool,
        chainId: config.SCOOP_CHAIN_ID,
        quoteAsset,
        tradeTimestampsSec: timestamps,
        rpcUrl: config.ROBINHOOD_RPC_URL,
        dryRun: args.dryRun,
      });
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'indexer:replay:token oracle backfill',
          dryRun: args.dryRun,
          quoteAsset: backfill.quoteAsset,
          feedAddress: backfill.feedAddress,
          feedDecimals: backfill.feedDecimals,
          insertedCount: backfill.insertedCount,
          reusedCount: backfill.reusedCount,
          observations: backfill.observations.map((o) => ({
            observedAtSec: o.observedAtSec,
            observedAtIso: new Date(o.observedAtSec * 1000).toISOString(),
            roundId: o.roundId,
            aggregatorRound: o.aggregatorRound,
            answer: o.answer,
            priceUsdX18: o.priceUsdX18,
            ageSec: o.ageSec,
            sourceName: o.sourceName,
            inserted: o.inserted,
          })),
        }),
      );
    }

    const report = await enrichTokenHistoricalUsd(pool, {
      chainId: config.SCOOP_CHAIN_ID,
      tokenAddress: args.token,
      quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
      dryRun: args.dryRun,
    });
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:replay:token complete',
        durationMs: Date.now() - started,
        ...report,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'indexer:replay:token failed', error: message }),
  );
  process.exitCode = 1;
});
