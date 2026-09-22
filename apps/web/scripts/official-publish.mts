/**
 * Operator CLI: publish official $TAPE with an EXISTING Streamflow lock.
 *
 * Usage:
 *   pnpm official:publish --mint 9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump --preflight-only
 *   pnpm official:publish --mint 9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump
 *   pnpm official:publish --mint <MINT> --lock-id <STREAMFLOW_LOCK_ID>
 *
 * SAFETY: never creates a Streamflow lock, never broadcasts a chain tx,
 * never requires SOLANA_KEYPAIR_PATH.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, getPumpWatchlistItem } from '@scoop/db';
import {
  importExternalPumpMarket,
  preflightExternalPumpMint,
} from '../src/lib/launch/import-external-pump-market.ts';
import { OFFICIAL_TAPE_DEPLOYER } from '../src/lib/official-tape/constants.ts';
import {
  auditOfficialTapeEnv,
  formatEnvAuditReport,
} from '../src/lib/official-tape/env-audit.ts';
import { assertOfficialTapePreflight } from '../src/lib/official-tape/mint-gates.ts';
import {
  getOfficialTapeSolanaConfig,
  setOfficialTapeSolanaConfig,
  type OfficialTapeSolanaConfig,
} from '../src/lib/official-tape/official-config.ts';
import { verifyExistingOfficialStreamflowLock } from '../src/lib/official-tape/verify-existing-streamflow-lock.ts';
import { loadEnvFile } from '../../../scripts/lib/env-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv: string[]) {
  let mint: string | null = null;
  let lockId: string | null = null;
  let preflightOnly = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') help = true;
    else if (a === '--preflight-only') preflightOnly = true;
    else if (a === '--mint') mint = argv[++i] ?? null;
    else if (a.startsWith('--mint=')) mint = a.slice('--mint='.length);
    else if (a === '--lock-id') lockId = argv[++i] ?? null;
    else if (a.startsWith('--lock-id=')) lockId = a.slice('--lock-id='.length);
  }
  return { mint, lockId, preflightOnly, help };
}

function printHelp() {
  console.log(`Official $TAPE publish (existing Streamflow lock — no lock creation).

Usage:
  pnpm official:publish --mint <REAL_TAPE_MINT> --preflight-only
  pnpm official:publish --mint <REAL_TAPE_MINT>
  pnpm official:publish --mint <REAL_TAPE_MINT> --lock-id <STREAMFLOW_LOCK_ID>

Requires DATABASE_URL + SOLANA_RPC_URL + Supabase for image mirror.
Does NOT require SOLANA_KEYPAIR_PATH.
Does NOT create or broadcast a Streamflow lock.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const fileEnv = {
    ...loadEnvFile(join(root, '.env.local')),
    ...loadEnvFile(join(root, 'apps/web/.env.local')),
  };
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
  }

  const envAudit = auditOfficialTapeEnv(process.env);
  console.log(formatEnvAuditReport(envAudit));
  console.log('');
  console.log('Publish path does NOT require SOLANA_KEYPAIR_PATH.');
  console.log('');

  if (!args.mint) {
    console.error('BLOCKED — missing --mint <REAL_TAPE_MINT> (do not fabricate)');
    process.exit(1);
  }

  if (!envAudit.readyForPublish) {
    console.error('BLOCKED — OFFICIAL TAPE PUBLISH NOT READY');
    console.error(envAudit.publishBlockReasons.join('\n'));
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL!;
  const rpcUrl = process.env.SOLANA_RPC_URL!;

  console.log('=== GATE 1 — PUMP PREFLIGHT ===');
  console.log(`Mint: ${args.mint}`);
  const preflight = await preflightExternalPumpMint({
    mint: args.mint,
    rpcUrl,
  });
  assertOfficialTapePreflight(preflight);
  console.log(
    JSON.stringify(
      {
        mint: preflight.mint,
        name: preflight.name,
        symbol: preflight.symbol,
        decimals: preflight.decimals,
        supplyRaw: preflight.supplyRaw,
        creator: preflight.creator,
        creatorMatch: preflight.creator === OFFICIAL_TAPE_DEPLOYER,
        pumpProvenance: preflight.pumpProvenance,
        bondingCurve: preflight.bondingCurve,
        metadataUri: preflight.metadataUri,
        imageUri: preflight.imageUri,
        launchSignature: preflight.launchSignature,
      },
      null,
      2,
    ),
  );

  const pool = createPool(databaseUrl);
  try {
    const existingOfficial = await getOfficialTapeSolanaConfig(pool);
    if (existingOfficial && existingOfficial.mint !== preflight.mint) {
      console.error('BLOCKED — different official Solana TAPE mint already configured');
      console.error(`existing=${existingOfficial.mint}`);
      process.exit(1);
    }

    const watchBefore = await getPumpWatchlistItem(pool, preflight.mint);
    console.log(
      JSON.stringify(
        {
          alreadyOnWatchlist: Boolean(watchBefore),
          existingOfficialMint: existingOfficial?.mint ?? null,
          existingLockVerified: existingOfficial?.lockVerified ?? null,
        },
        null,
        2,
      ),
    );

    if (args.preflightOnly) {
      console.log('\n=== GATE 6 — STREAMFLOW LOCK VERIFY (read-only preview) ===');
      const lockPreview = await verifyExistingOfficialStreamflowLock({
        rpcUrl,
        mint: preflight.mint,
        decimals: preflight.decimals,
        totalSupplyRaw: preflight.supplyRaw,
        lockId: args.lockId,
      });
      console.log(JSON.stringify(lockPreview, null, 2));
      console.log('\n=== PREFLIGHT-ONLY COMPLETE ===');
      console.log('NEW STREAMFLOW LOCK CREATED: NO');
      console.log('BLOCKCHAIN TX BROADCAST: NO');
      console.log('PRIVATE KEY USED: NO');
      return;
    }

    console.log('\n=== GATE 2 — EXTERNAL PUMP IMPORT (importKind=official) ===');
    const imported = await importExternalPumpMarket({
      db: pool,
      mint: preflight.mint,
      rpcUrl,
      importKind: 'official',
      notes: 'official-tape-existing-streamflow-lock',
    });
    console.log(
      JSON.stringify(
        {
          created: imported.persist.created,
          displayImageUrl: imported.displayImage.displayImageUrl,
          displayImageOk: imported.displayImage.ok,
          registryKind: imported.registryKind,
          watchlistPresent: imported.watchlistPresent,
        },
        null,
        2,
      ),
    );

    console.log('\n=== GATE 6 — VERIFY EXISTING STREAMFLOW LOCK ===');
    const lock = await verifyExistingOfficialStreamflowLock({
      rpcUrl,
      mint: preflight.mint,
      decimals: preflight.decimals,
      totalSupplyRaw: preflight.supplyRaw,
      lockId: args.lockId,
    });
    console.log(JSON.stringify(lock, null, 2));

    if (!lock.verified) {
      console.error('\nBLOCKED — EXISTING STREAMFLOW LOCK NOT VERIFIED');
      console.error(
        'Token may be imported, but official registration and lock badges remain disabled.',
      );
      console.log('\nNEW STREAMFLOW LOCK CREATED: NO');
      console.log('BLOCKCHAIN TX BROADCAST: NO');
      console.log('PRIVATE KEY USED: NO');
      process.exit(1);
    }

    console.log('\n=== GATE 7 — OFFICIAL REGISTRATION ===');
    const config: OfficialTapeSolanaConfig = {
      chainFamily: 'solana',
      chainId: 900001,
      marketSource: 'pump',
      mint: preflight.mint,
      symbol: 'TAPE',
      deployer: OFFICIAL_TAPE_DEPLOYER,
      lockProvider: 'streamflow',
      lockVerified: true,
      lockId: lock.lockId,
      lockSignature: lock.creationSignature,
      unlockAt: lock.unlockAtIso,
      lockAmountRaw: lock.depositedAmountRaw,
      registeredAt: new Date().toISOString(),
      lockBadgeCopy: lock.lockBadgeCopy,
    };
    const reg = await setOfficialTapeSolanaConfig(pool, config);
    console.log(
      JSON.stringify(
        {
          status: reg.status,
          mint: config.mint,
          lockId: config.lockId,
          unlockAt: config.unlockAt,
          lockBadgeCopy: lock.lockBadgeCopy,
        },
        null,
        2,
      ),
    );

    if (reg.status === 'blocked_existing') {
      console.error('BLOCKED — different official mint already configured');
      process.exit(1);
    }

    const watchAfter = await getPumpWatchlistItem(pool, preflight.mint);
    console.log(`
=== PUBLISH COMPLETE ===
Mint:              ${preflight.mint}
Creator:           ${OFFICIAL_TAPE_DEPLOYER}
Image:             ${imported.displayImage.displayImageUrl ?? 'CHECK'}
Watchlist:         ${watchAfter ? 'YES' : 'NO'}
Lock ID:           ${lock.lockId}
Unlock UTC:        ${lock.unlockAtIso}
Badge:             ${lock.lockBadgeCopy}
Token page:        /token/${preflight.mint}

NEW STREAMFLOW LOCK CREATED: NO
BLOCKCHAIN TX BROADCAST: NO
SUPPORT BUY MADE: NO
PRIVATE KEY USED: NO
`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
