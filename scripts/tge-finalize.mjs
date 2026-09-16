/**
 * Operator CLI: TAPE TGE finalizer.
 *
 * Usage:
 *   pnpm tape:tge-finalize 0xTAPE_ADDRESS              # read-only preview
 *   pnpm tape:tge-finalize 0xTAPE_ADDRESS --confirm    # production mutation (armed)
 *   pnpm tape:check-signer                              # read-only signer preflight
 *
 * Never prints DATABASE_URL / RPC URL / secrets / private keys.
 * Cursor/CI must not run --confirm against production during Phase 3 arming review.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import pg from 'pg';
import { loadEnvFile } from './lib/env-local.mjs';
import { parseTgeFinalizeArgs } from './lib/tge-identity.mjs';
import {
  formatTgeFinalizePreview,
  runTgeFinalizeRehearsal,
} from './lib/tge-finalize-rehearsal.mjs';
import { detectDevAllocationOnChain } from './lib/tge-dev-allocation.mjs';
import { readOfficialTapeContract } from './lib/tge-protocol-settings-read.mjs';
import {
  loadHoodlockLocksForOwnerToken,
  readErc20AllowanceBalance,
  verifyHoodlockDeployment,
} from './lib/hoodlock.mjs';
import {
  HOODLOCK_LOCKER_ADDRESS,
  HOODLOCK_TGE_MAX_FEE_WEI,
  TAPE_TGE_SIGNER_PRIVATE_KEY_ENV,
} from './lib/tge-constants.mjs';
import {
  buildProductionNotArmedMessage,
  isTgeProductionExecutionArmed,
  TGE_PRODUCTION_EXECUTION_ARMED,
} from './lib/tge-production-gate.mjs';
import { assertHoodlockFeeWithinTgeLimit } from './lib/tge-fee-ceiling.mjs';
import {
  resolveTapeTgeSignerFromEnv,
  sanitizeSignerError,
} from './lib/tge-signer-env.mjs';
import { buildLiveTgeFinalizeDeps } from './lib/tge-live-deps.mjs';
import { runTgeFinalizeMutation } from './lib/tge-mutation.mjs';
import { formatTgeConfirmFailure } from './lib/tge-failure-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function redactSecrets(message) {
  return sanitizeSignerError(
    String(message)
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***')
      .replace(/https?:\/\/[^\s]*alchemy[^\s]*/gi, 'https://***'),
  );
}

function printHelp() {
  console.log(`TAPE TGE finalizer.

Usage:
  pnpm tape:tge-finalize <0xTAPE_ADDRESS>
  pnpm tape:tge-finalize <0xTAPE_ADDRESS> --confirm
  pnpm tape:check-signer
  pnpm tape:verify-lock <0xTAPE_ADDRESS>

Preview is always read-only (WRITE: NO).
--confirm runs the guarded mutation workflow when TGE_PRODUCTION_EXECUTION_ARMED is true
(currently: ${TGE_PRODUCTION_EXECUTION_ARMED ? 'ARMED' : 'DISARMED'}).
tape:verify-lock is read-only post-lock / manual-takeover verification.

Requires ROBINHOOD_RPC_URL.
DATABASE_URL required for --confirm; optional for preview DB classification and verify-lock.
${TAPE_TGE_SIGNER_PRIVATE_KEY_ENV} required for --confirm and tape:check-signer.
Optional TAPE_TGE_DEV_BUY_WALLET = additional expected-wallet assertion.
`);
}

function mergeEnv(fileEnv) {
  return { ...fileEnv, ...process.env };
}

async function runPreview(parsed, fileEnv) {
  const rpcUrl = process.env.ROBINHOOD_RPC_URL || fileEnv.ROBINHOOD_RPC_URL;
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const configuredDevBuyWallet =
    process.env.TAPE_TGE_DEV_BUY_WALLET || fileEnv.TAPE_TGE_DEV_BUY_WALLET || null;

  if (!rpcUrl) {
    console.error('ROBINHOOD_RPC_URL is missing (set in environment or .env.local)');
    process.exit(1);
  }

  const client = createPublicClient({ transport: http(rpcUrl) });

  /** @type {`0x${string}` | null} */
  let existingOfficialTape = null;
  if (databaseUrl) {
    const pgClient = new pg.Client({ connectionString: databaseUrl });
    try {
      await pgClient.connect();
      existingOfficialTape = await readOfficialTapeContract(pgClient);
    } catch (error) {
      console.error(
        `Warning: could not read protocol_settings (continuing with UNSET assumption): ${redactSecrets(error)}`,
      );
      existingOfficialTape = null;
    } finally {
      await pgClient.end().catch(() => {});
    }
  } else {
    console.error(
      'Note: DATABASE_URL missing — Protocol DB classification will use UNSET (no write attempted).',
    );
  }

  let chainTimestampUnix = Math.floor(Date.now() / 1000);
  try {
    const block = await client.getBlock({ blockTag: 'latest' });
    chainTimestampUnix = Number(block.timestamp);
  } catch {
    // keep wall clock
  }

  const hoodlock = await verifyHoodlockDeployment({ client });
  const feeSafety = hoodlock.ok
    ? assertHoodlockFeeWithinTgeLimit(hoodlock.fee)
    : null;

  const signerResolved = resolveTapeTgeSignerFromEnv(mergeEnv(fileEnv));
  const signerAddress = signerResolved.ok ? signerResolved.address : null;

  const rehearsalBase = await runTgeFinalizeRehearsal({
    candidateRaw: /** @type {string} */ (parsed.address),
    rpcUrl,
    identityClient: client,
    hoodlock,
    existingOfficialTape,
    configuredDevBuyWallet,
    chainTimestampUnix,
    initialBuyEvents: [],
  });

  let initialBuyEvents = [];
  let allowance = null;
  let balance = null;
  let existingLocks = [];

  let finalResult = rehearsalBase;
  if (rehearsalBase.identity?.ok && rehearsalBase.candidate) {
    const detected = await detectDevAllocationOnChain({
      client,
      tapeAddress: rehearsalBase.candidate,
      expectedWallet: configuredDevBuyWallet,
    });
    if (detected.events?.length) {
      initialBuyEvents = detected.events;
    }

    const withAlloc = await runTgeFinalizeRehearsal({
      candidateRaw: parsed.address,
      identity: rehearsalBase.identity,
      hoodlock,
      existingOfficialTape,
      configuredDevBuyWallet,
      chainTimestampUnix,
      initialBuyEvents,
    });

    if (
      withAlloc.allocation.status === 'READY' &&
      withAlloc.allocation.wallet &&
      withAlloc.allocation.amount != null &&
      withAlloc.canonicalTape
    ) {
      try {
        const ab = await readErc20AllowanceBalance({
          client,
          token: withAlloc.canonicalTape,
          owner: withAlloc.allocation.wallet,
          spender: HOODLOCK_LOCKER_ADDRESS,
        });
        allowance = ab.allowance;
        balance = ab.balance;
      } catch {
        allowance = null;
        balance = null;
      }
      try {
        existingLocks = await loadHoodlockLocksForOwnerToken({
          client,
          owner: withAlloc.allocation.wallet,
          token: withAlloc.canonicalTape,
        });
      } catch {
        existingLocks = [];
      }
    }

    finalResult = await runTgeFinalizeRehearsal({
      candidateRaw: parsed.address,
      identity: rehearsalBase.identity,
      hoodlock,
      existingOfficialTape,
      configuredDevBuyWallet,
      chainTimestampUnix,
      initialBuyEvents,
      allowance,
      balance,
      existingLocks,
    });
  }

  // Attach Phase 3 preview fields
  finalResult.productionArmed = TGE_PRODUCTION_EXECUTION_ARMED;
  finalResult.signerAddress = signerAddress;
  finalResult.signerConfigured = Boolean(signerAddress);
  finalResult.feeSafety = feeSafety;
  finalResult.maxFeeWei = HOODLOCK_TGE_MAX_FEE_WEI;
  if (
    signerAddress &&
    finalResult.allocation?.status === 'READY' &&
    finalResult.allocation.wallet
  ) {
    finalResult.signerDevBuyMatch =
      signerAddress.toLowerCase() ===
      finalResult.allocation.wallet.toLowerCase()
        ? 'PASS'
        : 'BLOCKED';
  } else if (!signerAddress) {
    finalResult.signerDevBuyMatch = 'PENDING';
  } else {
    finalResult.signerDevBuyMatch = 'PENDING';
  }

  console.log(formatTgeFinalizePreview(finalResult));
  if (!finalResult.identity?.ok) process.exit(1);
}

async function runConfirm(parsed, fileEnv) {
  if (!isTgeProductionExecutionArmed()) {
    console.error(buildProductionNotArmedMessage());
    process.exit(1);
  }

  const rpcUrl = process.env.ROBINHOOD_RPC_URL || fileEnv.ROBINHOOD_RPC_URL;
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const configuredDevBuyWallet =
    process.env.TAPE_TGE_DEV_BUY_WALLET || fileEnv.TAPE_TGE_DEV_BUY_WALLET || null;

  if (!rpcUrl) {
    console.error('ROBINHOOD_RPC_URL is missing');
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error('DATABASE_URL is required for --confirm');
    process.exit(1);
  }

  const signer = resolveTapeTgeSignerFromEnv(mergeEnv(fileEnv));
  if (!signer.ok) {
    console.error(signer.reason);
    process.exit(1);
  }

  const keyLoad = (await import('./lib/tge-signer-env.mjs')).loadTapeTgeSignerPrivateKey(
    mergeEnv(fileEnv),
  );
  if (!keyLoad.ok) {
    console.error(keyLoad.reason);
    process.exit(1);
  }

  const deps = buildLiveTgeFinalizeDeps({
    rpcUrl,
    databaseUrl,
    privateKey: keyLoad.privateKey,
    configuredExpectedWallet: configuredDevBuyWallet,
  });

  try {
    const result = await runTgeFinalizeMutation({
      candidateRaw: /** @type {string} */ (parsed.address),
      // NEVER pass armedOverride from CLI
      account: deps.account,
      configuredExpectedWallet: configuredDevBuyWallet,
      db: deps.db,
      getChainId: deps.getChainId,
      verifyHoodlock: deps.verifyHoodlock,
      getInitialBuyEvents: deps.getInitialBuyEvents,
      getAllowanceBalance: deps.getAllowanceBalance,
      loadLocks: deps.loadLocks,
      getBlockTimestamp: deps.getBlockTimestamp,
      simulateApproval: deps.simulateApproval,
      sendApproval: deps.sendApproval,
      waitReceipt: deps.waitReceipt,
      simulateLock: deps.simulateLock,
      sendLock: deps.sendLock,
      getBlockByNumber: deps.getBlockByNumber,
      readLock: deps.readLock,
    });

    if (!result.ok) {
      console.error(formatTgeConfirmFailure(result));
      process.exit(1);
    }

    console.log(result.proof);
    process.exit(0);
  } finally {
    await deps.dispose();
  }
}

async function main() {
  const parsed = parseTgeFinalizeArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const fileEnv = loadEnvFile(join(root, '.env.local'));

  if (parsed.confirm) {
    await runConfirm(parsed, fileEnv);
    return;
  }

  await runPreview(parsed, fileEnv);
}

await main().catch((error) => {
  console.error('TGE FINALIZATION FAILED — DEV TOKEN LOCK NOT VERIFIED');
  console.error(
    'AUTOMATED LOCK STATUS UNCERTAIN — VERIFY ON-CHAIN BEFORE MANUAL TAKEOVER',
  );
  console.error(`Failed: ${redactSecrets(error)}`);
  console.error('Action: run pnpm tape:verify-lock <TAPE> before any manual lock.');
  process.exit(1);
});
