/**
 * Read-only post-finalization / post-manual HoodLock verification.
 * Never signs, never broadcasts, never writes DB.
 */
import { createPublicClient, formatUnits, http } from 'viem';
import {
  BLOCKSCOUT_ADDRESS_URL,
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
  TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
} from './tge-constants.mjs';
import {
  classifyExistingHoodlockLocks,
  loadHoodlockLocksForOwnerToken,
  readErc20AllowanceBalance,
  resolveHoodlockLockCreationTimestamp,
  verifyHoodlockDeployment,
} from './hoodlock.mjs';
import { detectDevAllocationOnChain } from './tge-dev-allocation.mjs';
import { verifyTapeIdentityForTge } from './tge-identity.mjs';
import { normalizeTapeAddress } from './tape-contract-verify.mjs';
import {
  formatUnlockUtc,
  minimumUnlockUnixFromReference,
  proposeUnlockUnix,
  unlockSatisfiesDevBuyLockPolicy,
} from './tge-unlock-policy.mjs';
import { readOfficialTapeContract } from './tge-protocol-settings-read.mjs';
import { assertHoodlockFeeWithinTgeLimit } from './tge-fee-ceiling.mjs';

const erc20DecimalsAbi = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
];

/**
 * Classify official-DB reporting for verify-lock (no mutation).
 * @param {{
 *   pgQuery?: ((sql: string, params?: unknown[]) => Promise<{ rows: { value?: string }[] }>) | null,
 *   databaseUrl?: string | null,
 *   officialDb: `0x${string}` | null,
 *   officialDbError: string | null,
 *   tape: `0x${string}`,
 * }} args
 * @returns {{
 *   status: 'SKIPPED' | 'UNSET' | 'MATCH' | 'DIFFERENT' | 'ERROR',
 *   line: string,
 * }}
 */
export function classifyOfficialDbReportLine(args) {
  if (!args.pgQuery) {
    if (args.databaseUrl) {
      return {
        status: 'ERROR',
        line:
          args.officialDbError ??
          'SKIPPED unavailable — DATABASE_URL present but DB query not wired',
      };
    }
    return {
      status: 'SKIPPED',
      line: 'SKIPPED — DATABASE_URL not provided',
    };
  }
  if (args.officialDbError) {
    return {
      status: 'ERROR',
      line: `Read error: ${args.officialDbError}`,
    };
  }
  if (!args.officialDb) {
    return { status: 'UNSET', line: 'UNSET' };
  }
  if (args.officialDb.toLowerCase() === args.tape.toLowerCase()) {
    return { status: 'MATCH', line: `MATCH — ${args.officialDb}` };
  }
  return { status: 'DIFFERENT', line: `DIFFERENT — ${args.officialDb}` };
}

/**
 * @param {{
 *   candidateRaw: string,
 *   rpcUrl: string,
 *   databaseUrl?: string | null,
 *   expectedWallet?: string | null,
 *   client?: any,
 *   pgQuery?: ((sql: string, params?: unknown[]) => Promise<{ rows: { value?: string }[] }>) | null,
 *   resolveLockCreation?: typeof resolveHoodlockLockCreationTimestamp,
 *   verifyHoodlock?: typeof verifyHoodlockDeployment,
 * }} args
 */
export async function runTapeHoodlockLockVerification(args) {
  const tape = normalizeTapeAddress(args.candidateRaw);
  if (!tape) {
    return {
      ok: false,
      exitCode: 1,
      report: 'Invalid EVM address.',
    };
  }

  const client =
    args.client ??
    createPublicClient({
      transport: http(args.rpcUrl),
    });

  const chainId = await client.getChainId();
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return {
      ok: false,
      exitCode: 1,
      report: `Wrong chain ID from RPC: got ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`,
    };
  }

  const identity = await verifyTapeIdentityForTge({
    address: tape,
    client,
  });
  if (!identity.ok) {
    return {
      ok: false,
      exitCode: 1,
      report: `Token identity failed: ${identity.reason}`,
      identity,
    };
  }

  let decimals =
    identity.decimals != null ? Number(identity.decimals) : null;
  if (decimals == null) {
    try {
      decimals = Number(
        await client.readContract({
          address: tape,
          abi: erc20DecimalsAbi,
          functionName: 'decimals',
        }),
      );
    } catch {
      decimals = null;
    }
  }

  const allocation = await detectDevAllocationOnChain({
    client,
    tapeAddress: tape,
    expectedWallet: args.expectedWallet ?? null,
  });

  const verifyHoodlock = args.verifyHoodlock ?? verifyHoodlockDeployment;
  const hoodlock = await verifyHoodlock({ client });
  const feeSafety = hoodlock.ok
    ? assertHoodlockFeeWithinTgeLimit(hoodlock.fee)
    : null;

  let officialDb = null;
  let officialDbError = null;
  if (args.pgQuery) {
    try {
      officialDb = await readOfficialTapeContract({ query: args.pgQuery });
    } catch (error) {
      officialDbError = error instanceof Error ? error.message : String(error);
    }
  } else if (args.databaseUrl) {
    officialDbError = 'DATABASE_URL present but pgQuery not wired';
  }

  const officialDbReport = classifyOfficialDbReportLine({
    pgQuery: args.pgQuery ?? null,
    databaseUrl: args.databaseUrl ?? null,
    officialDb,
    officialDbError,
    tape,
  });

  const chainTs = Number(
    (await client.getBlock({ blockTag: 'latest' })).timestamp,
  );
  const proposedManualUnlock = proposeUnlockUnix({
    chainTimestampUnix: chainTs,
  });
  const minUnlockFromNow = minimumUnlockUnixFromReference(chainTs);

  /** @type {null | { allowance: bigint, balance: bigint }} */
  let ab = null;
  /** @type {any[]} */
  let locks = [];
  /** @type {ReturnType<typeof classifyExistingHoodlockLocks> | null} */
  let existing = null;
  /** @type {any | null} */
  let matchingLock = null;
  /** @type {{
   *   ok: boolean,
   *   reason: string | null,
   *   unlockCheck?: ReturnType<typeof unlockSatisfiesDevBuyLockPolicy>,
   *   lockCreation?: any,
   * } | null} */
  let policy = null;
  /** @type {number | null} */
  let lockCreationTimestampUnix = null;

  if (allocation.status === 'READY' && allocation.wallet && allocation.amount != null) {
    ab = await readErc20AllowanceBalance({
      client,
      token: tape,
      owner: allocation.wallet,
      spender: HOODLOCK_LOCKER_ADDRESS,
    });
    locks = await loadHoodlockLocksForOwnerToken({
      client,
      owner: allocation.wallet,
      token: tape,
    });
    // Do not filter by "unlock >= now+6m" — that incorrectly drops valid older locks.
    // Match on owner/token/amount/active only; policy uses lock creation timestamp.
    existing = classifyExistingHoodlockLocks({
      locks,
      canonicalTape: tape,
      expectedOwner: allocation.wallet,
      expectedAmount: allocation.amount,
      minimumUnlockUnix: 0,
    });
    if (existing.status === 'ALREADY_COMPLETE' && existing.matches[0]) {
      matchingLock = existing.matches[0];
      const amount =
        typeof matchingLock.amount === 'bigint'
          ? matchingLock.amount
          : BigInt(matchingLock.amount);

      const resolveCreation =
        args.resolveLockCreation ?? resolveHoodlockLockCreationTimestamp;
      const lockCreation = await resolveCreation({
        client,
        lockId: matchingLock.id,
        locker: hoodlock.ok ? hoodlock.locker : HOODLOCK_LOCKER_ADDRESS,
      });

      if (!lockCreation.ok) {
        policy = {
          ok: false,
          reason:
            lockCreation.reason ??
            'Could not determine lock creation/block timestamp — failing closed',
          lockCreation,
        };
      } else {
        lockCreationTimestampUnix = lockCreation.timestampUnix;
        const unlockCheck = unlockSatisfiesDevBuyLockPolicy({
          unlockTimeUnix: Number(matchingLock.unlockTime),
          lockTimeReferenceUnix: lockCreation.timestampUnix,
        });
        const fieldsOk =
          !matchingLock.withdrawn &&
          matchingLock.token.toLowerCase() === tape.toLowerCase() &&
          matchingLock.owner.toLowerCase() ===
            allocation.wallet.toLowerCase() &&
          amount === allocation.amount &&
          unlockCheck.ok;
        policy = {
          ok: fieldsOk,
          reason: fieldsOk
            ? null
            : 'Matching lock found but fails TGE policy / field checks vs lock creation time',
          unlockCheck,
          lockCreation,
        };
      }
    }
  }

  const lines = [];
  lines.push('TAPE HOODLOCK LOCK VERIFICATION — READ ONLY');
  lines.push('');
  lines.push(`Chain: Robinhood Chain (${chainId})`);
  lines.push(`TAPE: ${tape}`);
  lines.push(`Symbol: ${identity.symbol ?? '(unreadable)'}`);
  lines.push(`Name: ${identity.name ?? '(unreadable)'}`);
  lines.push(
    `Decimals: ${decimals != null ? decimals : '(unreadable)'}`,
  );
  lines.push('');
  lines.push('Official DB (protocol_settings.tape_official_contract):');
  lines.push(`  ${officialDbReport.line}`);

  lines.push('');
  lines.push('Dev allocation (InitialBuyExecuted.tokensOut):');
  if (allocation.status !== 'READY') {
    lines.push(`  Status: ${allocation.status}`);
    lines.push(`  Reason: ${allocation.reason ?? '(none)'}`);
  } else {
    lines.push(`  Status: READY`);
    lines.push(`  Deployer / owner: ${allocation.wallet}`);
    lines.push(`  Amount raw: ${allocation.amount.toString()}`);
    if (decimals != null) {
      lines.push(
        `  Amount formatted: ${formatUnits(allocation.amount, decimals)} TAPE`,
      );
    }
    if (allocation.events?.[0]?.txHash) {
      lines.push(`  Source tx: ${allocation.events[0].txHash}`);
    }
  }

  lines.push('');
  lines.push('HoodLock:');
  if (!hoodlock.ok) {
    lines.push(`  FAILED — ${hoodlock.reason}`);
  } else {
    lines.push(`  Locker: ${hoodlock.locker}`);
    lines.push(`  Code hash: VERIFIED`);
    lines.push(
      `  Live fee: ${feeSafety?.liveFeeEth ?? '?'} ETH (${hoodlock.fee.toString()} wei)`,
    );
    lines.push(
      `  Fee ceiling check: ${feeSafety?.ok ? 'PASS' : 'BLOCKED'}`,
    );
    lines.push(`  Explorer: ${BLOCKSCOUT_ADDRESS_URL}/${hoodlock.locker}`);
  }

  lines.push('');
  lines.push('Allowance / balance:');
  if (!ab) {
    lines.push('  (unavailable — allocation not READY)');
  } else {
    lines.push(`  balanceOf(owner): ${ab.balance.toString()}`);
    lines.push(
      `  allowance(owner, HoodLock): ${ab.allowance.toString()}`,
    );
    if (allocation.amount != null) {
      lines.push(
        `  allowance >= tokensOut: ${ab.allowance >= allocation.amount ? 'YES' : 'NO'}`,
      );
      lines.push(
        `  balance >= tokensOut: ${ab.balance >= allocation.amount ? 'YES' : 'NO'}`,
      );
    }
  }

  lines.push('');
  lines.push('Existing matching locks (owner ∩ token, amount, unlock, active):');
  if (!existing) {
    lines.push('  (unavailable — allocation not READY)');
  } else if (existing.status === 'NOT_STARTED') {
    lines.push('  NONE — safe to create a manual lock after re-checking');
  } else if (existing.status === 'BLOCKED') {
    lines.push(`  AMBIGUOUS — ${existing.reason}`);
    lines.push('  Do NOT create another lock until resolved.');
  } else if (existing.status === 'ALREADY_COMPLETE') {
    const lock = existing.matches[0];
    lines.push('  MATCH FOUND');
    lines.push(`  Lock ID: ${lock.id.toString()}`);
    lines.push(`  Owner: ${lock.owner}`);
    lines.push(`  Token: ${lock.token}`);
    lines.push(`  Amount: ${lock.amount.toString()}`);
    lines.push(`  Unlock unix: ${lock.unlockTime.toString()}`);
    lines.push(`  Unlock UTC: ${formatUnlockUtc(Number(lock.unlockTime))}`);
    lines.push(`  Withdrawn: ${lock.withdrawn}`);
    if (lockCreationTimestampUnix != null) {
      lines.push(
        `  Lock block timestamp: ${lockCreationTimestampUnix} (${formatUnlockUtc(lockCreationTimestampUnix)})`,
      );
      lines.push(
        `  Policy (>= ${TGE_DEV_BUY_LOCK_CALENDAR_MONTHS} calendar months from lock creation): ${policy?.ok ? 'PASS' : 'FAIL'}`,
      );
    } else {
      lines.push(
        `  Lock block timestamp: UNKNOWN — ${policy?.reason ?? 'could not resolve'}`,
      );
      lines.push(
        `  Policy (>= ${TGE_DEV_BUY_LOCK_CALENDAR_MONTHS} calendar months from lock creation): FAIL`,
      );
    }
  }

  lines.push('');
  lines.push('Manual unlock suggestion (if creating a new lock now):');
  lines.push(
    `  Reference: current chain timestamp ${chainTs} (${formatUnlockUtc(chainTs)})`,
  );
  lines.push(
    `  Minimum unlock unix: ${minUnlockFromNow} (${formatUnlockUtc(minUnlockFromNow)})`,
  );
  lines.push(
    `  Proposed (+${TGE_UNLOCK_SAFETY_MARGIN_SECONDS}s margin): ${proposedManualUnlock} (${formatUnlockUtc(proposedManualUnlock)})`,
  );
  lines.push(
    '  Use HoodLock UI timestamp >= minimum; prefer proposed with margin.',
  );

  lines.push('');
  lines.push('No transaction was signed.');
  lines.push('No transaction was broadcast.');
  lines.push('No database write was attempted.');

  const matchingOk =
    hoodlock.ok === true &&
    existing?.status === 'ALREADY_COMPLETE' &&
    policy?.ok === true;
  lines.push('');
  if (matchingOk) {
    lines.push('Final result: PASS — MATCHING ACTIVE LOCK VERIFIED');
  } else if (!hoodlock.ok) {
    lines.push('Final result: FAIL — HOODLOCK DEPLOYMENT NOT VERIFIED');
  } else if (existing?.status === 'BLOCKED') {
    lines.push('Final result: FAIL — AMBIGUOUS EXISTING LOCKS');
  } else if (allocation.status !== 'READY') {
    lines.push('Final result: FAIL — DEV ALLOCATION NOT PROVEN');
  } else if (existing?.status === 'NOT_STARTED') {
    lines.push('Final result: FAIL — NO MATCHING LOCK (manual takeover may be required)');
  } else {
    lines.push('Final result: FAIL — LOCK NOT VERIFIED');
  }

  return {
    ok: matchingOk,
    exitCode: matchingOk ? 0 : 1,
    report: lines.join('\n'),
    tape,
    allocation,
    hoodlock,
    allowance: ab?.allowance ?? null,
    balance: ab?.balance ?? null,
    existing,
    matchingLock,
    officialDb,
    officialDbStatus: officialDbReport.status,
    lockCreationTimestampUnix,
    policy,
    chainTimestampUnix: chainTs,
    proposedManualUnlock,
  };
}
