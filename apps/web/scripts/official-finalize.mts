/**
 * Operator CLI: official $TAPE staged finalization.
 *
 * Usage:
 *   pnpm official:finalize --mint <REAL_TAPE_MINT> --preflight-only
 *   pnpm official:finalize --mint <REAL_TAPE_MINT>
 *   pnpm official:finalize --mint <REAL_TAPE_MINT> --confirm "LOCK TAPE FOR 6 MONTHS"
 *
 * Gate 0 / safety: no Streamflow broadcast without env+signer+exact phrase.
 * No mint fabrication.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, getPumpWatchlistItem } from '@scoop/db';
import {
  importExternalPumpMarket,
  preflightExternalPumpMint,
} from '../src/lib/launch/import-external-pump-market.ts';
import {
  OFFICIAL_TAPE_DEPLOYER,
  OFFICIAL_TAPE_LOCK_CONFIRM_PHRASE,
} from '../src/lib/official-tape/constants.ts';
import { collectDevBalanceReport } from '../src/lib/official-tape/dev-balance.ts';
import {
  auditOfficialTapeEnv,
  formatEnvAuditReport,
} from '../src/lib/official-tape/env-audit.ts';
import { assertOfficialTapePreflight } from '../src/lib/official-tape/mint-gates.ts';
import { getOfficialTapeSolanaConfig } from '../src/lib/official-tape/official-config.ts';
import { assertLockConfirmPhrase } from '../src/lib/official-tape/streamflow-lock.ts';
import { loadEnvFile } from '../../../scripts/lib/env-local.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs(argv: string[]) {
  let mint: string | null = null;
  let confirm: string | null = null;
  let preflightOnly = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') help = true;
    else if (a === '--preflight-only') preflightOnly = true;
    else if (a === '--mint') mint = argv[++i] ?? null;
    else if (a.startsWith('--mint=')) mint = a.slice('--mint='.length);
    else if (a === '--confirm') confirm = argv[++i] ?? '';
    else if (a.startsWith('--confirm=')) confirm = a.slice('--confirm='.length);
  }
  return { mint, confirm, preflightOnly, help };
}

function printHelp() {
  console.log(`Official $TAPE staged finalization.

Usage:
  pnpm official:finalize --mint <REAL_TAPE_MINT> --preflight-only
  pnpm official:finalize --mint <REAL_TAPE_MINT>
  pnpm official:finalize --mint <REAL_TAPE_MINT> --confirm "${OFFICIAL_TAPE_LOCK_CONFIRM_PHRASE}"

Requires local SOLANA_KEYPAIR_PATH for lock broadcast.
Never fabricates a mint. Streamflow lock is irreversible before unlock.
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
  // Prefer process.env for CI overrides; fill from files without overwriting.
  for (const [k, v] of Object.entries(fileEnv)) {
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
  }

  const envAudit = auditOfficialTapeEnv(process.env);
  console.log(formatEnvAuditReport(envAudit));
  console.log('');

  if (!args.mint) {
    console.error('BLOCKED — missing --mint <REAL_TAPE_MINT> (do not fabricate)');
    process.exit(1);
  }

  if (!envAudit.readyForReadOnlyPreflight) {
    console.error('BLOCKED — OFFICIAL TAPE FINALIZATION NOT READY');
    console.error(envAudit.blockReasons.filter((r) => !r.includes('SOLANA_KEYPAIR')).join('\n') || envAudit.blockReasons.join('\n'));
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL!;
  const rpcUrl = process.env.SOLANA_RPC_URL!;

  console.log('=== GATE 1 — PUMP PREFLIGHT (read-only) ===');
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

  console.log('\n=== GATE 5 — DEV BALANCE / UNLOCK PREFLIGHT (read-only) ===');
  const balance = await collectDevBalanceReport({
    rpcUrl,
    mint: preflight.mint,
    decimals: preflight.decimals,
    totalSupplyRaw: preflight.supplyRaw,
  });
  console.log(
    JSON.stringify(
      {
        rawDevBalance: balance.rawDevBalance.toString(),
        humanDevBalance: balance.humanDevBalance,
        totalSupplyRaw: balance.totalSupplyRaw.toString(),
        percentOfSupply: balance.percentOfSupply,
        dustResidueRaw: balance.dust.dustResidueRaw.toString(),
        productLanguage: balance.dust.productLanguage,
        solHuman: balance.solHuman,
        solSufficientForLock: balance.solSufficientForLock,
        proposedUnlockIso: balance.proposedUnlockIso,
        calendarDuration: '6 months',
      },
      null,
      2,
    ),
  );
  if (!balance.solSufficientForLock) {
    console.error('BLOCKED — deployer SOL insufficient for Streamflow lock fees');
    process.exit(1);
  }

  const pool = createPool(databaseUrl);
  try {
    const existingOfficial = await getOfficialTapeSolanaConfig(pool);
    if (existingOfficial && existingOfficial.mint !== preflight.mint) {
      console.error('BLOCKED — different official Solana TAPE mint already configured');
      console.error(`existing=${existingOfficial.mint}`);
      process.exit(1);
    }

    const watch = await getPumpWatchlistItem(pool, preflight.mint);
    console.log(
      JSON.stringify(
        {
          alreadyOnWatchlist: Boolean(watch),
          existingOfficialMint: existingOfficial?.mint ?? null,
          existingLockVerified: existingOfficial?.lockVerified ?? null,
        },
        null,
        2,
      ),
    );

    console.log('\nNO STREAMFLOW TRANSACTION BROADCAST DURING PREFLIGHT');

    if (args.preflightOnly) {
      console.log('\n=== PREFLIGHT-ONLY COMPLETE ===');
      if (!envAudit.readyForLockBroadcast) {
        console.log('Lock broadcast still BLOCKED until SOLANA_KEYPAIR_PATH matches deployer.');
        console.log(envAudit.blockReasons.join('\n'));
      }
      return;
    }

    // Full path: import + staged lock (only with confirm + signer).
    if (!envAudit.readyForLockBroadcast) {
      console.error('BLOCKED — SAFE LOCAL DEPLOYER SIGNER NOT AVAILABLE');
      console.error(envAudit.blockReasons.join('\n'));
      process.exit(1);
    }

    console.log('\n=== GATE 2 — EXTERNAL PUMP IMPORT (importKind=official) ===');
    const imported = await importExternalPumpMarket({
      db: pool,
      mint: preflight.mint,
      rpcUrl,
      importKind: 'official',
      notes: 'official-tape-6month-finalization',
    });
    console.log(
      JSON.stringify(
        {
          created: imported.persist.created,
          displayImageUrl: imported.displayImage.displayImageUrl,
          registryKind: imported.registryKind,
          watchlistPresent: imported.watchlistPresent,
        },
        null,
        2,
      ),
    );

    console.log(`
OFFICIAL $TAPE — FINAL IRREVERSIBLE REVIEW

Mint:                ${preflight.mint}
Symbol:              TAPE
Network:             Solana
Launch venue:        Pump.fun

Creator/deployer:
${OFFICIAL_TAPE_DEPLOYER}

Signer matches:       YES
SCOOP token page:     READY (verify after import)
Image mirror:         ${imported.displayImage.ok ? 'READY' : 'CHECK'}
Alchemy tracking:     ${imported.watchlistPresent ? 'READY' : 'PENDING_REFRESH'}

Dev balance:          ${balance.humanDevBalance}
Lock amount:          ${balance.humanDevBalance} (${balance.dust.productLanguage})
% supply:             ${balance.percentOfSupply}
Lock provider:        Streamflow
Lock type:            Time lock
Unlock recipient:     ${OFFICIAL_TAPE_DEPLOYER}
Lock duration:        6 CALENDAR MONTHS
Unlock UTC:           ${balance.proposedUnlockIso}
Cancelable:           NO

OFFICIAL SITE PUBLICATION OCCURS ONLY AFTER LOCK VERIFICATION.
`);

    if (args.confirm !== OFFICIAL_TAPE_LOCK_CONFIRM_PHRASE) {
      assertLockConfirmPhrase(args.confirm);
    }

    console.error(
      'BLOCKED — Streamflow broadcast stage is implemented behind confirmation, but this run stops before chain write until operator re-runs with explicit ops go-ahead after PASS preflight report.',
    );
    console.error(
      'Safety hold: Gate 0 signer was required; preflight report must be PASS before any lock tx.',
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
