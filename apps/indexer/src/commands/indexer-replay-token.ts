import { createPool } from '@scoop/db';
import { HELLO_FIXTURE, normalizeAddress } from '@scoop/shared';
import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { enrichTokenHistoricalUsd } from '../live/projections/enrichTokenUsd.js';

loadLocalEnv();

function parseArgs(argv: string[]): {
  token: string;
  dryRun: boolean;
  help: boolean;
} {
  let token: string = HELLO_FIXTURE.token;
  let dryRun = false;
  let help = false;
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
  return { token, dryRun, help };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:replay:token usage',
        usage:
          'pnpm indexer:replay:token [--token 0x...] [--dry-run]  # defaults to HELLO; DB-only USD enrich; does not move main checkpoint',
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
