import { createPool } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { refreshStale24hMarketWindows } from '../live/projections/expire24hVolume.js';
import { MARKET_VOLUME_24H_WINDOW_SECONDS } from '../live/projections/market.js';

loadLocalEnv();

function parseArgs(argv: string[]): { dryRun: boolean; help: boolean } {
  let dryRun = false;
  let help = false;
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--dry-run' || arg === '--inspect') {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { dryRun, help };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:refresh-24h-volume usage',
        usage:
          'pnpm indexer:refresh-24h-volume [--dry-run]  # one-shot recompute of materialized 24h metrics for markets with non-zero 24h fields; does not require SCOOP_INDEXING_ENABLED; does not move checkpoint',
        windowSeconds: MARKET_VOLUME_24H_WINDOW_SECONDS,
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
    if (args.dryRun) {
      const { listMarketsNeeding24hRefresh } = await import(
        '../live/projections/expire24hVolume.js'
      );
      const candidates = await listMarketsNeeding24hRefresh(pool, config.SCOOP_CHAIN_ID);
      console.log(
        JSON.stringify({
          level: 'info',
          message: '24h volume refresh dry-run',
          chainId: config.SCOOP_CHAIN_ID,
          candidates: candidates.length,
          tokens: candidates.map((c) => c.tokenAddress),
          windowSeconds: MARKET_VOLUME_24H_WINDOW_SECONDS,
          dryRun: true,
          elapsedMs: Date.now() - started,
        }),
      );
      return;
    }

    const outcome = await refreshStale24hMarketWindows(pool, {
      chainId: config.SCOOP_CHAIN_ID,
      quoteUsdMaxAgeSeconds: config.SCOOP_QUOTE_USD_MAX_AGE_SECONDS,
      dustRaw: config.SCOOP_LAUNCH_DUST_RAW,
    });

    console.log(
      JSON.stringify({
        level: outcome.failed > 0 ? 'warn' : 'info',
        message: '24h volume refresh complete',
        chainId: config.SCOOP_CHAIN_ID,
        candidates: outcome.candidates,
        refreshed: outcome.refreshed,
        failed: outcome.failed,
        failures: outcome.results.filter((r) => !r.ok),
        windowSeconds: MARKET_VOLUME_24H_WINDOW_SECONDS,
        elapsedMs: Date.now() - started,
      }),
    );

    if (outcome.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: '24h volume refresh failed',
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
