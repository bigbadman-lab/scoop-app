/**
 * Operator CLI: mint-scoped removal of an external Pump canary import.
 *
 * Safe sequence (worker race):
 *   1. detach launch/watchlist source
 *   2. wait for DB watchlist absence + watchlist refresh settle
 *   3. mint-scoped full cleanup
 *   4. wait 60s; one bounded orphan scrub if needed
 *
 * Usage:
 *   pnpm official:canary-remove --mint <MINT>
 *   pnpm official:canary-remove --mint <MINT> --confirm "REMOVE EXTERNAL PUMP CANARY"
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectExternalPumpCanaryFootprint,
  createPool,
  deleteExternalPumpCanaryMarket,
  detachExternalPumpCanaryWatchlist,
  getExternalPumpImport,
  getPumpWatchlistItem,
  scrubExternalPumpCanaryMarketData,
  withTransaction,
} from '@scoop/db';
import { loadEnvFile } from '../../../scripts/lib/env-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIRM_PHRASE = 'REMOVE EXTERNAL PUMP CANARY';
/** Default worker watchlist refresh is 45s — wait past one full cycle. */
const WATCHLIST_SETTLE_MS = 50_000;
const POST_CLEANUP_SETTLE_MS = 60_000;

function parseArgs(argv: string[]) {
  let mint: string | null = null;
  let confirm: string | null = null;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') help = true;
    else if (a === '--mint') mint = argv[++i] ?? null;
    else if (a.startsWith('--mint=')) mint = a.slice('--mint='.length);
    else if (a === '--confirm') confirm = argv[++i] ?? '';
    else if (a.startsWith('--confirm=')) confirm = a.slice('--confirm='.length);
  }
  return { mint, confirm, help };
}

function printHelp() {
  console.log(`Remove an external Pump canary import (mint-scoped).

Usage:
  pnpm official:canary-remove --mint <MINT>
  pnpm official:canary-remove --mint <MINT> --confirm "${CONFIRM_PHRASE}"

Refuses official / unprotected / non-registry mints.
Coordinates watchlist detach before pump_* scrub to avoid worker reinsertion.
`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasPumpOrphans(fp: Awaited<ReturnType<typeof collectExternalPumpCanaryFootprint>>): boolean {
  return (
    fp.pumpTrades > 0 ||
    fp.pumpCandles > 0 ||
    fp.pumpMarketState ||
    fp.pumpCheckpoints ||
    fp.scoopSupportBuys > 0
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.mint) {
    console.error('Missing --mint <base58>');
    printHelp();
    process.exit(1);
  }

  const fileEnv = {
    ...loadEnvFile(join(root, '.env.local')),
    ...loadEnvFile(join(root, 'apps/web/.env.local')),
  };
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  const pool = createPool(databaseUrl);
  try {
    const registry = await getExternalPumpImport(pool, args.mint);
    const footprint = await collectExternalPumpCanaryFootprint(pool, args.mint);
    const watchBefore = await getPumpWatchlistItem(pool, args.mint);

    console.log('=== READ-ONLY CLEANUP PLAN ===');
    console.log(
      JSON.stringify(
        { registry, footprint, watchlist: watchBefore ? { mint: watchBefore.mint } : null },
        null,
        2,
      ),
    );

    if (!registry) {
      console.error('BLOCK: mint is not in external_pump_import_canaries registry');
      process.exit(1);
    }
    if (registry.importKind !== 'canary') {
      console.error(`BLOCK: registry kind is ${registry.importKind}, not canary`);
      process.exit(1);
    }
    if (registry.mint !== args.mint.trim()) {
      console.error('BLOCK: mint mismatch');
      process.exit(1);
    }

    if (args.confirm !== CONFIRM_PHRASE) {
      console.error(
        `\nRefusing to delete without exact confirmation.\n` +
          `Re-run:\n` +
          `  pnpm official:canary-remove --mint ${registry.mint} --confirm "${CONFIRM_PHRASE}"`,
      );
      process.exit(1);
    }

    console.log('\n=== PHASE 1: DETACH WATCHLIST SOURCE (launches) ===');
    const detached = await withTransaction(pool, async (client) =>
      detachExternalPumpCanaryWatchlist(client, registry.mint),
    );
    console.log(JSON.stringify({ launchesDeleted: detached }, null, 2));

    const watchAfterDetach = await getPumpWatchlistItem(pool, registry.mint);
    if (watchAfterDetach) {
      console.error('BLOCK: mint still present on DB watchlist after launch detach');
      process.exit(1);
    }
    console.log('Watchlist (DB): absent');

    console.log(
      `\n=== WAITING ${WATCHLIST_SETTLE_MS}ms for worker in-memory watchlist refresh ===`,
    );
    await sleep(WATCHLIST_SETTLE_MS);

    console.log('\n=== PHASE 2: FULL MINT-SCOPED CLEANUP ===');
    const counts = await withTransaction(pool, async (client) =>
      deleteExternalPumpCanaryMarket(client, registry.mint),
    );
    console.log(JSON.stringify({ deleted: counts }, null, 2));

    let after = await collectExternalPumpCanaryFootprint(pool, registry.mint);
    console.log('=== POST-CLEANUP FOOTPRINT ===');
    console.log(JSON.stringify(after, null, 2));

    console.log(`\n=== WAITING ${POST_CLEANUP_SETTLE_MS}ms before reinsertion check ===`);
    await sleep(POST_CLEANUP_SETTLE_MS);

    after = await collectExternalPumpCanaryFootprint(pool, registry.mint);
    const watchAfterSettle = await getPumpWatchlistItem(pool, registry.mint);
    console.log('=== 60s FOOTPRINT ===');
    console.log(
      JSON.stringify({ footprint: after, watchlist: watchAfterSettle }, null, 2),
    );

    let orphanScrub: Record<string, number> | null = null;
    if (hasPumpOrphans(after)) {
      console.log('\n=== PHASE 3: BOUNDED ORPHAN SCRUB (pump_* only, once) ===');
      orphanScrub = await withTransaction(pool, async (client) =>
        scrubExternalPumpCanaryMarketData(client, registry.mint),
      );
      console.log(JSON.stringify({ orphanScrub }, null, 2));
      after = await collectExternalPumpCanaryFootprint(pool, registry.mint);
      console.log('=== POST-ORPHAN FOOTPRINT ===');
      console.log(JSON.stringify(after, null, 2));
    }

    const retainedImage =
      after.displayImageUrl || footprint.displayImageUrl
        ? {
            note: 'Content-addressed Supabase token-image objects are retained (shared/manual path). DB references removed.',
            priorDisplayImageUrl: footprint.displayImageUrl,
          }
        : null;
    if (retainedImage) {
      console.log(JSON.stringify({ imageCleanup: retainedImage }, null, 2));
    }

    const finalWatch = await getPumpWatchlistItem(pool, registry.mint);
    const clean =
      !after.token &&
      !after.launch &&
      !after.registry &&
      !hasPumpOrphans(after) &&
      !finalWatch;
    console.log(
      JSON.stringify(
        {
          final: {
            clean,
            watchlistAbsent: !finalWatch,
            footprint: after,
            orphanScrubApplied: orphanScrub != null,
          },
        },
        null,
        2,
      ),
    );
    if (!clean) {
      console.error('BLOCK: residual mint-scoped state remains after cleanup');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
