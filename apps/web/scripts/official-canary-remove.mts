/**
 * Operator CLI: mint-scoped removal of an external Pump canary import.
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
  getExternalPumpImport,
  withTransaction,
} from '@scoop/db';
import { loadEnvFile } from '../../../scripts/lib/env-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIRM_PHRASE = 'REMOVE EXTERNAL PUMP CANARY';

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
`);
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

    console.log('=== READ-ONLY CLEANUP PLAN ===');
    console.log(JSON.stringify({ registry, footprint }, null, 2));

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

    console.log('\n=== DELETING CANARY FOOTPRINT ===');
    const counts = await withTransaction(pool, async (client) =>
      deleteExternalPumpCanaryMarket(client, registry.mint),
    );
    console.log(JSON.stringify({ deleted: counts }, null, 2));

    const after = await collectExternalPumpCanaryFootprint(pool, registry.mint);
    console.log('=== POST-CLEANUP FOOTPRINT ===');
    console.log(JSON.stringify(after, null, 2));

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
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
