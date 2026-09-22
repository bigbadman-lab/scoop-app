/**
 * Operator CLI: import an external Pump mint via the reusable import path.
 *
 * Usage:
 *   pnpm official:canary-import --mint <MINT>
 *   pnpm official:canary-import --mint <MINT> --confirm
 *   pnpm official:canary-import --mint <MINT> --preflight-only
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '@scoop/db';
import { loadEnvFile } from '../../../scripts/lib/env-local.mjs';
import {
  importExternalPumpMarket,
  preflightExternalPumpMint,
} from '../src/lib/launch/import-external-pump-market.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CANARY_MINT = '3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump';

function parseArgs(argv: string[]) {
  let mint: string | null = null;
  let confirm = false;
  let preflightOnly = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') help = true;
    else if (a === '--confirm') confirm = true;
    else if (a === '--preflight-only') preflightOnly = true;
    else if (a === '--mint') {
      mint = argv[++i] ?? null;
    } else if (a.startsWith('--mint=')) {
      mint = a.slice('--mint='.length);
    }
  }
  return { mint, confirm, preflightOnly, help };
}

function printHelp() {
  console.log(`Import an external Pump mint into SCOOP (reusable $TAPE path).

Usage:
  pnpm official:canary-import --mint ${CANARY_MINT}
  pnpm official:canary-import --mint ${CANARY_MINT} --confirm
  pnpm official:canary-import --mint ${CANARY_MINT} --preflight-only

Requires DATABASE_URL + SOLANA_RPC_URL and Supabase token-image env for mirror.
`);
}

function printPreflight(p: Awaited<ReturnType<typeof preflightExternalPumpMint>>) {
  console.log('Mint:', p.mint);
  console.log('Name:', p.name);
  console.log('Symbol:', p.symbol);
  console.log('Decimals:', p.decimals);
  console.log('Supply:', p.supplyRaw);
  console.log('Creator:', p.creator);
  console.log('Pump provenance:', p.pumpProvenance);
  console.log('Bonding curve:', p.bondingCurve);
  console.log('Metadata URI:', p.metadataUri);
  console.log('Image URI:', p.imageUri);
  console.log('Launch signature:', p.launchSignature);
  console.log('Launch slot:', p.launchSlot);
  console.log('Launched at:', p.launchedAt);
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
  const rpcUrl = process.env.SOLANA_RPC_URL || fileEnv.SOLANA_RPC_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }
  if (!rpcUrl) {
    console.error('SOLANA_RPC_URL missing');
    process.exit(1);
  }

  // Propagate Supabase env for image mirror.
  for (const key of [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
  ]) {
    if (!process.env[key] && fileEnv[key]) {
      process.env[key] = fileEnv[key];
    }
  }

  console.log('=== PHASE 1 — READ-ONLY PREFLIGHT ===');
  const preflight = await preflightExternalPumpMint({ rpcUrl, mint: args.mint });
  printPreflight(preflight);

  if (args.preflightOnly) {
    console.log('Preflight-only complete.');
    return;
  }

  if (!args.confirm) {
    console.error(
      '\nRefusing to import without --confirm.\n' +
        `Re-run: pnpm official:canary-import --mint ${preflight.mint} --confirm`,
    );
    process.exit(1);
  }

  console.log('\n=== PHASE 2 — IMPORT (reusable external Pump path) ===');
  const pool = createPool(databaseUrl);
  try {
    const result = await importExternalPumpMarket({
      db: pool,
      rpcUrl,
      mint: preflight.mint,
      importKind: 'canary',
      notes: 'external-pump-canary-import-cleanup gate',
      blockExistingNonRegistry: true,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.displayImage.ok) {
      console.error('Image mirror failed:', result.displayImage.reason);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
