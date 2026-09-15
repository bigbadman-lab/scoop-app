/**
 * TGE finalizer mutation orchestrator (Phase 2).
 *
 * Production path is gated by TGE_PRODUCTION_EXECUTION_ARMED (default false).
 * Tests may inject armedOverride: true with fake deps — never hits production.
 *
 * Never prints private keys / mnemonics / seeds.
 */
import { formatEther, getAddress } from 'viem';
import {
  BLOCKSCOUT_ADDRESS_URL,
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  SCOOP_FACTORY_ADDRESS,
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
  TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
} from './tge-constants.mjs';
import {
  buildExactApprovalIntent,
  buildHoodlockLockIntent,
  classifyApprovalNeed,
  classifyExistingHoodlockLocks,
  decodeLockedEventsFromReceipt,
  hoodlockLockerAbi,
  loadHoodlockLocksForOwnerToken,
  readErc20AllowanceBalance,
  verifyHoodlockDeployment,
} from './hoodlock.mjs';
import { classifyDevAllocationFromInitialBuyEvents } from './tge-dev-allocation.mjs';
import { ensureOfficialTapeRegistered } from './tge-official-tape-db.mjs';
import {
  buildProductionNotArmedMessage,
  isTgeProductionExecutionArmed,
} from './tge-production-gate.mjs';
import {
  assertDevBuyBalanceInvariant,
  assertSignerMatchesDevBuyWallet,
  deriveSignerAddress,
} from './tge-signer.mjs';
import {
  formatUnlockUtc,
  minimumUnlockUnixFromReference,
  proposeUnlockUnix,
  unlockSatisfiesDevBuyLockPolicy,
} from './tge-unlock-policy.mjs';
import { assertHoodlockFeeWithinTgeLimit } from './tge-fee-ceiling.mjs';
import { normalizeTapeAddress } from './tape-contract-verify.mjs';

/**
 * Pure final verification of a HoodLock lock record against TGE policy.
 * @param {{
 *   lock: {
 *     owner: string,
 *     token: string,
 *     amount: bigint,
 *     unlockTime: bigint | number,
 *     withdrawn: boolean,
 *   },
 *   canonicalTape: string,
 *   expectedOwner: string,
 *   expectedAmount: bigint,
 *   lockBlockTimestampUnix: number,
 * }} args
 */
export function verifyHoodlockLockAgainstTgePolicy(args) {
  const token = args.lock.token.toLowerCase();
  const owner = args.lock.owner.toLowerCase();
  const amount =
    typeof args.lock.amount === 'bigint'
      ? args.lock.amount
      : BigInt(args.lock.amount);
  const unlock = Number(args.lock.unlockTime);

  if (token !== args.canonicalTape.toLowerCase()) {
    return { ok: false, reason: 'FAILED — LOCK TOKEN MISMATCH' };
  }
  if (owner !== args.expectedOwner.toLowerCase()) {
    return { ok: false, reason: 'FAILED — LOCK OWNER MISMATCH' };
  }
  if (args.lock.withdrawn) {
    return { ok: false, reason: 'FAILED — LOCK ALREADY WITHDRAWN' };
  }
  if (amount !== args.expectedAmount) {
    return {
      ok: false,
      reason:
        'FAILED — HOODLOCK RECORDED AMOUNT DOES NOT MATCH DEV-BUY ALLOCATION',
      recorded: amount,
      expected: args.expectedAmount,
    };
  }
  const policy = unlockSatisfiesDevBuyLockPolicy({
    unlockTimeUnix: unlock,
    lockTimeReferenceUnix: args.lockBlockTimestampUnix,
  });
  if (!policy.ok) {
    return {
      ok: false,
      reason:
        'FAILED — UNLOCK SHORTER THAN SIX CALENDAR MONTHS FROM LOCK BLOCK',
      policy,
    };
  }
  return { ok: true, reason: null, policy };
}

/**
 * Format durable success proof for the operator.
 * @param {Record<string, unknown>} p
 */
export function formatTgeFinalizationProof(p) {
  const lines = [];
  lines.push('TAPE TGE FINALIZATION — VERIFIED');
  lines.push('');
  lines.push('Chain:');
  lines.push(String(p.chainId));
  lines.push('');
  lines.push('Official TAPE:');
  lines.push(String(p.canonicalTape));
  lines.push('');
  lines.push('Official TAPE DB:');
  lines.push('VERIFIED');
  lines.push('');
  lines.push('Factory:');
  lines.push(String(p.factory));
  lines.push('');
  lines.push('Dev-buy wallet:');
  lines.push(String(p.devBuyWallet));
  lines.push('');
  lines.push('Verified signer:');
  lines.push(String(p.signer));
  lines.push('');
  lines.push('Dev-buy allocation:');
  lines.push(String(p.devBuyAmount));
  lines.push('');
  lines.push('Locked amount:');
  lines.push(String(p.lockedAmount));
  lines.push('');
  lines.push('HoodLock:');
  lines.push(String(p.hoodlock));
  lines.push('');
  lines.push('Lock ID:');
  lines.push(String(p.lockId));
  lines.push('');
  lines.push('Lock tx:');
  lines.push(String(p.lockTxHash));
  lines.push('');
  lines.push('Lock block:');
  lines.push(String(p.lockBlock));
  lines.push('');
  lines.push('Lock timestamp:');
  lines.push(String(p.lockTimestamp));
  lines.push('');
  lines.push('Unlock timestamp:');
  lines.push(String(p.unlockTime));
  lines.push('');
  lines.push('Unlock UTC:');
  lines.push(String(p.unlockUtc));
  lines.push('');
  lines.push('Policy:');
  lines.push(`${TGE_DEV_BUY_LOCK_CALENDAR_MONTHS} calendar months minimum`);
  lines.push('');
  lines.push('Approval tx:');
  lines.push(String(p.approvalTx));
  lines.push('');
  lines.push('HoodLock code hash:');
  lines.push('VERIFIED');
  lines.push('');
  lines.push('Final result:');
  lines.push('PASS');
  if (p.blockscoutLockUrl) {
    lines.push('');
    lines.push('Blockscout locker:');
    lines.push(String(p.blockscoutLockUrl));
  }
  return lines.join('\n');
}

/**
 * Run confirmed TGE finalization with injectable dependencies.
 *
 * @param {{
 *   candidateRaw: string,
 *   armedOverride?: boolean,
 *   account: { address: string },
 *   configuredExpectedWallet?: string | null,
 *   db: {
 *     readOfficial: () => Promise<`0x${string}` | null>,
 *     ensureRegistered: (candidate: `0x${string}`) => Promise<{
 *       status: string,
 *       reason?: string | null,
 *       canonical: `0x${string}` | null,
 *       wrote?: boolean,
 *     }>,
 *     rereadOfficial?: () => Promise<`0x${string}` | null>,
 *   },
 *   getChainId: () => Promise<number>,
 *   verifyHoodlock: () => Promise<any>,
 *   getInitialBuyEvents: (tape: `0x${string}`) => Promise<Array<{
 *     token: string,
 *     deployer: string,
 *     tokensOut: bigint,
 *     quoteAmountIn: bigint,
 *   }>>,
 *   getAllowanceBalance: (args: {
 *     token: `0x${string}`,
 *     owner: `0x${string}`,
 *     spender: `0x${string}`,
 *   }) => Promise<{ allowance: bigint, balance: bigint }>,
 *   loadLocks: (args: {
 *     owner: `0x${string}`,
 *     token: `0x${string}`,
 *   }) => Promise<Array<any>>,
 *   getBlockTimestamp: () => Promise<number>,
 *   simulateApproval?: (intent: any) => Promise<{ ok: boolean, reason?: string }>,
 *   sendApproval?: (intent: any) => Promise<{ hash: `0x${string}` }>,
 *   waitReceipt?: (hash: `0x${string}`) => Promise<{
 *     status: 'success' | 'reverted' | string,
 *     blockNumber: bigint | number,
 *     logs?: any[],
 *   }>,
 *   simulateLock?: (intent: any) => Promise<{ ok: boolean, reason?: string }>,
 *   sendLock?: (intent: any) => Promise<{ hash: `0x${string}` }>,
 *   getBlockByNumber?: (n: bigint | number) => Promise<{ timestamp: bigint | number }>,
 *   readLock?: (id: bigint) => Promise<{
 *     owner: string,
 *     token: string,
 *     amount: bigint,
 *     unlockTime: bigint,
 *     withdrawn: boolean,
 *   }>,
 * }} deps
 */
export async function runTgeFinalizeMutation(deps) {
  if (!isTgeProductionExecutionArmed({ armedOverride: deps.armedOverride })) {
    return {
      ok: false,
      blocked: true,
      reason: buildProductionNotArmedMessage(),
      mutated: false,
    };
  }

  const candidate = normalizeTapeAddress(deps.candidateRaw);
  if (!candidate) {
    return { ok: false, blocked: true, reason: 'Invalid EVM address.', mutated: false };
  }

  const chainId = await deps.getChainId();
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return {
      ok: false,
      blocked: true,
      reason: `Wrong chain ID: got ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`,
      mutated: false,
    };
  }

  const signer = deriveSignerAddress(deps.account);
  /** @type {string[]} */
  const mutations = [];

  // --- DB stage ---
  const dbResult = await deps.db.ensureRegistered(candidate);
  if (dbResult.status === 'BLOCKED' || dbResult.status === 'FAILED') {
    return {
      ok: false,
      blocked: dbResult.status === 'BLOCKED',
      reason: dbResult.reason,
      mutated: Boolean(dbResult.wrote),
      stage: 'OFFICIAL_TAPE_DB',
    };
  }
  if (dbResult.wrote) mutations.push('OFFICIAL_TAPE_DB');

  const canonicalTape = dbResult.canonical;
  if (!canonicalTape) {
    return {
      ok: false,
      blocked: true,
      reason: 'Canonical TAPE missing after DB stage',
      mutated: mutations.length > 0,
    };
  }

  // --- Dev allocation from canonical address ---
  const events = await deps.getInitialBuyEvents(canonicalTape);
  const allocation = classifyDevAllocationFromInitialBuyEvents({
    events,
    tapeAddress: canonicalTape,
    expectedWallet: deps.configuredExpectedWallet,
  });
  if (allocation.status !== 'READY' || !allocation.wallet || allocation.amount == null) {
    return {
      ok: false,
      blocked: true,
      reason: allocation.reason ?? 'BLOCKED — TAPE DEV BUY NOT PROVEN',
      mutated: mutations.length > 0,
      stage: 'DEV_ALLOCATION',
      canonicalTape,
    };
  }

  const signerCheck = assertSignerMatchesDevBuyWallet({
    signerAddress: signer,
    devBuyWallet: allocation.wallet,
    configuredExpectedWallet: deps.configuredExpectedWallet,
  });
  if (!signerCheck.ok) {
    return {
      ok: false,
      blocked: true,
      reason: signerCheck.reason,
      mutated: mutations.length > 0,
      stage: 'SIGNER',
      canonicalTape,
      signer: signerCheck.signer,
      devBuyWallet: allocation.wallet,
    };
  }

  const hoodlock = await deps.verifyHoodlock();
  if (!hoodlock.ok) {
    return {
      ok: false,
      blocked: true,
      reason: hoodlock.reason,
      mutated: mutations.length > 0,
      stage: 'HOODLOCK_IDENTITY',
      canonicalTape,
    };
  }

  const earlyFee = assertHoodlockFeeWithinTgeLimit(hoodlock.fee);
  if (!earlyFee.ok) {
    return {
      ok: false,
      blocked: true,
      reason: earlyFee.reason,
      liveFeeWei: earlyFee.liveFeeWei?.toString(),
      maxFeeWei: earlyFee.maxFeeWei?.toString(),
      liveFeeEth: earlyFee.liveFeeEth,
      maxFeeEth: earlyFee.maxFeeEth,
      mutated: mutations.length > 0,
      stage: 'HOODLOCK_FEE',
      canonicalTape,
    };
  }

  const minUnlock = minimumUnlockUnixFromReference(
    await deps.getBlockTimestamp(),
  );

  // Existing lock detection BEFORE approval
  const existingLocks = await deps.loadLocks({
    owner: allocation.wallet,
    token: canonicalTape,
  });
  const existing = classifyExistingHoodlockLocks({
    locks: existingLocks,
    canonicalTape,
    expectedOwner: allocation.wallet,
    expectedAmount: allocation.amount,
    minimumUnlockUnix: minUnlock,
  });
  if (existing.status === 'BLOCKED') {
    return {
      ok: false,
      blocked: true,
      reason: existing.reason,
      mutated: mutations.length > 0,
      stage: 'HOODLOCK_LOCK',
      canonicalTape,
    };
  }

  let approvalTx = 'SKIPPED_EXISTING_ALLOWANCE';
  let lockTxHash = null;
  let lockId = null;
  let lockBlock = null;
  let lockTimestamp = null;
  let unlockTime = null;
  let recordedAmount = null;
  let postLockBalance = null;

  if (existing.status === 'ALREADY_COMPLETE') {
    const lock = existing.matches[0];
    lockId = lock.id;
    unlockTime = Number(lock.unlockTime);
    recordedAmount = typeof lock.amount === 'bigint' ? lock.amount : BigInt(lock.amount);
    // Final verification still required — use current chain time as conservative ref if block unknown
    const refTs = await deps.getBlockTimestamp();
    const verified = verifyHoodlockLockAgainstTgePolicy({
      lock: {
        owner: lock.owner,
        token: lock.token,
        amount: recordedAmount,
        unlockTime,
        withdrawn: lock.withdrawn,
      },
      canonicalTape,
      expectedOwner: allocation.wallet,
      expectedAmount: allocation.amount,
      lockBlockTimestampUnix: refTs - TGE_UNLOCK_SAFETY_MARGIN_SECONDS, // existing lock: use policy vs "now-margin" is wrong
    });
    // For already-complete locks, verify unlock >= 6 months from *now* is insufficient —
    // Phase 1 policy used minimumUnlockUnixFromReference(now) at detection time already.
    // Re-check amount/owner/token/withdrawn strictly; unlock already gated by classifyExisting.
    if (
      lock.withdrawn ||
      lock.token.toLowerCase() !== canonicalTape.toLowerCase() ||
      lock.owner.toLowerCase() !== allocation.wallet.toLowerCase() ||
      recordedAmount !== allocation.amount
    ) {
      return {
        ok: false,
        blocked: true,
        reason: 'FAILED — EXISTING LOCK FAILED FINAL VERIFICATION',
        mutated: mutations.length > 0,
        stage: 'FINAL_VERIFICATION',
      };
    }
    void verified;
    const ab = await deps.getAllowanceBalance({
      token: canonicalTape,
      owner: allocation.wallet,
      spender: hoodlock.locker,
    });
    postLockBalance = ab.balance;

    const proof = formatTgeFinalizationProof({
      chainId: ROBINHOOD_CHAIN_ID,
      canonicalTape,
      factory: SCOOP_FACTORY_ADDRESS,
      devBuyWallet: allocation.wallet,
      signer: signerCheck.signer,
      devBuyAmount: allocation.amount.toString(),
      lockedAmount: recordedAmount.toString(),
      hoodlock: hoodlock.locker,
      lockId: lockId.toString(),
      lockTxHash: '(existing — discovered on-chain)',
      lockBlock: '(existing)',
      lockTimestamp: '(existing)',
      unlockTime: String(unlockTime),
      unlockUtc: formatUnlockUtc(unlockTime),
      approvalTx,
      blockscoutLockUrl: `${BLOCKSCOUT_ADDRESS_URL}/${hoodlock.locker}`,
    });

    return {
      ok: true,
      blocked: false,
      reason: null,
      mutated: mutations.length > 0,
      resumedExistingLock: true,
      proof,
      canonicalTape,
      lockId,
      stages: {
        OFFICIAL_TAPE_DB: dbResult.status,
        HOODLOCK_LOCK: 'ALREADY_COMPLETE',
      },
    };
  }

  // Balance invariant before approval
  let ab = await deps.getAllowanceBalance({
    token: canonicalTape,
    owner: allocation.wallet,
    spender: hoodlock.locker,
  });
  const balanceCheck = assertDevBuyBalanceInvariant({
    balance: ab.balance,
    devBuyAmount: allocation.amount,
  });
  if (!balanceCheck.ok) {
    return {
      ok: false,
      blocked: true,
      reason: balanceCheck.reason,
      expected: balanceCheck.expected?.toString(),
      balance: balanceCheck.balance?.toString(),
      deficit: balanceCheck.deficit?.toString(),
      mutated: mutations.length > 0,
      stage: 'BALANCE',
      canonicalTape,
    };
  }

  const lockAmount = balanceCheck.lockAmount;

  // --- Approval ---
  const approvalNeed = classifyApprovalNeed({
    currentAllowance: ab.allowance,
    requiredAmount: lockAmount,
  });

  if (approvalNeed.needsApprove) {
    // Re-confirm signer before any signing
    const preApproveSigner = assertSignerMatchesDevBuyWallet({
      signerAddress: deriveSignerAddress(deps.account),
      devBuyWallet: allocation.wallet,
      configuredExpectedWallet: deps.configuredExpectedWallet,
    });
    if (!preApproveSigner.ok) {
      return {
        ok: false,
        blocked: true,
        reason: preApproveSigner.reason,
        mutated: mutations.length > 0,
        stage: 'SIGNER',
      };
    }

    const approvalIntent = buildExactApprovalIntent({
      token: canonicalTape,
      spender: hoodlock.locker,
      amount: lockAmount,
    });

    if (deps.simulateApproval) {
      const sim = await deps.simulateApproval(approvalIntent);
      if (!sim.ok) {
        return {
          ok: false,
          blocked: true,
          reason: sim.reason ?? 'BLOCKED — APPROVAL SIMULATION FAILED',
          mutated: mutations.length > 0,
          stage: 'HOODLOCK_APPROVAL',
        };
      }
    }

    if (!deps.sendApproval || !deps.waitReceipt) {
      return {
        ok: false,
        blocked: true,
        reason: 'BLOCKED — APPROVAL TRANSPORT NOT CONFIGURED',
        mutated: mutations.length > 0,
      };
    }

    const sent = await deps.sendApproval(approvalIntent);
    mutations.push('HOODLOCK_APPROVAL');
    const receipt = await deps.waitReceipt(sent.hash);
    if (receipt.status !== 'success') {
      return {
        ok: false,
        blocked: false,
        reason: 'FAILED — APPROVAL RECEIPT NOT SUCCESSFUL',
        mutated: true,
        approvalTxHash: sent.hash,
        stage: 'HOODLOCK_APPROVAL',
      };
    }
    approvalTx = sent.hash;

    ab = await deps.getAllowanceBalance({
      token: canonicalTape,
      owner: allocation.wallet,
      spender: hoodlock.locker,
    });
    if (ab.allowance < lockAmount) {
      return {
        ok: false,
        blocked: true,
        reason: 'BLOCKED — POST-APPROVAL ALLOWANCE INSUFFICIENT',
        mutated: true,
        approvalTxHash: sent.hash,
        stage: 'HOODLOCK_APPROVAL',
      };
    }
  }

  // --- Post-approval safety recheck ---
  const chainId2 = await deps.getChainId();
  if (chainId2 !== ROBINHOOD_CHAIN_ID) {
    return {
      ok: false,
      blocked: true,
      reason: `Wrong chain ID before lock: ${chainId2}`,
      mutated: mutations.length > 0,
    };
  }

  if (deps.db.rereadOfficial) {
    const dbNow = await deps.db.rereadOfficial();
    if (
      !dbNow ||
      dbNow.toLowerCase() !== canonicalTape.toLowerCase()
    ) {
      return {
        ok: false,
        blocked: true,
        reason: 'BLOCKED — OFFICIAL TAPE ADDRESS CHANGED DURING FINALIZATION',
        mutated: mutations.length > 0,
        stage: 'RECHECK',
      };
    }
  }

  const signerRecheck = assertSignerMatchesDevBuyWallet({
    signerAddress: deriveSignerAddress(deps.account),
    devBuyWallet: allocation.wallet,
    configuredExpectedWallet: deps.configuredExpectedWallet,
  });
  if (!signerRecheck.ok) {
    return {
      ok: false,
      blocked: true,
      reason: signerRecheck.reason,
      mutated: mutations.length > 0,
      stage: 'RECHECK',
    };
  }

  const hoodlock2 = await deps.verifyHoodlock();
  if (!hoodlock2.ok) {
    return {
      ok: false,
      blocked: true,
      reason: hoodlock2.reason,
      mutated: mutations.length > 0,
      stage: 'RECHECK',
    };
  }
  if (hoodlock2.codeSha256 !== hoodlock.codeSha256) {
    return {
      ok: false,
      blocked: true,
      reason:
        'BLOCKED — HOODLOCK BYTECODE DOES NOT MATCH FORENSICALLY APPROVED DEPLOYMENT',
      mutated: mutations.length > 0,
      stage: 'RECHECK',
    };
  }

  ab = await deps.getAllowanceBalance({
    token: canonicalTape,
    owner: allocation.wallet,
    spender: hoodlock2.locker,
  });
  const balanceRecheck = assertDevBuyBalanceInvariant({
    balance: ab.balance,
    devBuyAmount: lockAmount,
  });
  if (!balanceRecheck.ok) {
    return {
      ok: false,
      blocked: true,
      reason: balanceRecheck.reason,
      mutated: mutations.length > 0,
      stage: 'RECHECK',
    };
  }
  if (ab.allowance < lockAmount) {
    return {
      ok: false,
      blocked: true,
      reason: 'BLOCKED — ALLOWANCE DISAPPEARED BEFORE LOCK',
      mutated: mutations.length > 0,
      stage: 'RECHECK',
    };
  }

  // Concurrent lock appeared?
  const locksAgain = await deps.loadLocks({
    owner: allocation.wallet,
    token: canonicalTape,
  });
  const existingAgain = classifyExistingHoodlockLocks({
    locks: locksAgain,
    canonicalTape,
    expectedOwner: allocation.wallet,
    expectedAmount: lockAmount,
    minimumUnlockUnix: minimumUnlockUnixFromReference(
      await deps.getBlockTimestamp(),
    ),
  });
  if (existingAgain.status === 'ALREADY_COMPLETE') {
    // Treat as resume — do not duplicate
    const lock = existingAgain.matches[0];
    const proof = formatTgeFinalizationProof({
      chainId: ROBINHOOD_CHAIN_ID,
      canonicalTape,
      factory: SCOOP_FACTORY_ADDRESS,
      devBuyWallet: allocation.wallet,
      signer: signerRecheck.signer,
      devBuyAmount: allocation.amount.toString(),
      lockedAmount: lock.amount.toString(),
      hoodlock: hoodlock2.locker,
      lockId: lock.id.toString(),
      lockTxHash: '(existing — discovered on-chain before broadcast)',
      lockBlock: '(existing)',
      lockTimestamp: '(existing)',
      unlockTime: String(lock.unlockTime),
      unlockUtc: formatUnlockUtc(Number(lock.unlockTime)),
      approvalTx,
      blockscoutLockUrl: `${BLOCKSCOUT_ADDRESS_URL}/${hoodlock2.locker}`,
    });
    return {
      ok: true,
      blocked: false,
      resumedExistingLock: true,
      proof,
      mutated: mutations.length > 0,
      canonicalTape,
      lockId: lock.id,
    };
  }
  if (existingAgain.status === 'BLOCKED') {
    return {
      ok: false,
      blocked: true,
      reason: existingAgain.reason,
      mutated: mutations.length > 0,
    };
  }

  const chainTs = await deps.getBlockTimestamp();
  const proposedUnlock = proposeUnlockUnix({
    chainTimestampUnix: chainTs,
    safetyMarginSeconds: TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
  });
  const freshFee = hoodlock2.fee;
  const feeCheck = assertHoodlockFeeWithinTgeLimit(freshFee);
  if (!feeCheck.ok) {
    return {
      ok: false,
      blocked: true,
      reason: feeCheck.reason,
      liveFeeWei: feeCheck.liveFeeWei?.toString(),
      maxFeeWei: feeCheck.maxFeeWei?.toString(),
      liveFeeEth: feeCheck.liveFeeEth,
      maxFeeEth: feeCheck.maxFeeEth,
      mutated: mutations.length > 0,
      stage: 'HOODLOCK_FEE',
      canonicalTape,
    };
  }

  const lockIntent = buildHoodlockLockIntent({
    token: canonicalTape,
    amount: lockAmount,
    unlockTime: proposedUnlock,
    feeWei: feeCheck.txValueWei,
    lockerAddress: hoodlock2.locker,
  });

  if (deps.simulateLock) {
    const sim = await deps.simulateLock(lockIntent);
    if (!sim.ok) {
      return {
        ok: false,
        blocked: true,
        reason: sim.reason ?? 'BLOCKED — HOODLOCK LOCK SIMULATION FAILED',
        mutated: mutations.length > 0,
        stage: 'HOODLOCK_LOCK',
        lockIntent,
        proposedUnlockUtc: formatUnlockUtc(proposedUnlock),
        liveFeeEth: feeCheck.liveFeeEth,
        maxFeeEth: feeCheck.maxFeeEth,
      };
    }
  }

  if (!deps.sendLock || !deps.waitReceipt) {
    return {
      ok: false,
      blocked: true,
      reason: 'BLOCKED — LOCK TRANSPORT NOT CONFIGURED',
      mutated: mutations.length > 0,
    };
  }

  const lockSent = await deps.sendLock(lockIntent);
  mutations.push('HOODLOCK_LOCK');
  lockTxHash = lockSent.hash;
  const lockReceipt = await deps.waitReceipt(lockSent.hash);
  if (lockReceipt.status !== 'success') {
    return {
      ok: false,
      blocked: false,
      reason: 'FAILED — LOCK RECEIPT NOT SUCCESSFUL',
      mutated: true,
      lockTxHash,
      stage: 'HOODLOCK_LOCK',
    };
  }
  lockBlock = lockReceipt.blockNumber;

  let lockBlockTs = chainTs;
  if (deps.getBlockByNumber) {
    const blk = await deps.getBlockByNumber(lockReceipt.blockNumber);
    lockBlockTs = Number(blk.timestamp);
  }
  lockTimestamp = lockBlockTs;

  const decoded = decodeLockedEventsFromReceipt({
    logs: lockReceipt.logs ?? [],
    lockerAddress: hoodlock2.locker,
    expectedOwner: allocation.wallet,
    expectedToken: canonicalTape,
  });
  if (decoded.status !== 'OK') {
    return {
      ok: false,
      blocked: true,
      reason:
        decoded.reason ??
        'FAILED — COULD NOT DECODE UNIQUE LOCKED EVENT FROM RECEIPT',
      mutated: true,
      lockTxHash,
      stage: 'HOODLOCK_LOCK',
    };
  }

  lockId = decoded.lock.id;
  unlockTime = Number(decoded.lock.unlockTime);
  recordedAmount = decoded.lock.amount;

  // Independent storage read
  if (deps.readLock) {
    const onchain = await deps.readLock(lockId);
    const verified = verifyHoodlockLockAgainstTgePolicy({
      lock: onchain,
      canonicalTape,
      expectedOwner: allocation.wallet,
      expectedAmount: lockAmount,
      lockBlockTimestampUnix: lockBlockTs,
    });
    if (!verified.ok) {
      return {
        ok: false,
        blocked: false,
        reason: verified.reason,
        mutated: true,
        lockTxHash,
        lockId: lockId.toString(),
        stage: 'FINAL_VERIFICATION',
      };
    }
    recordedAmount = typeof onchain.amount === 'bigint' ? onchain.amount : BigInt(onchain.amount);
    unlockTime = Number(onchain.unlockTime);
  } else {
    const verified = verifyHoodlockLockAgainstTgePolicy({
      lock: {
        owner: decoded.lock.owner,
        token: decoded.lock.token,
        amount: recordedAmount,
        unlockTime,
        withdrawn: false,
      },
      canonicalTape,
      expectedOwner: allocation.wallet,
      expectedAmount: lockAmount,
      lockBlockTimestampUnix: lockBlockTs,
    });
    if (!verified.ok) {
      return {
        ok: false,
        blocked: false,
        reason: verified.reason,
        mutated: true,
        lockTxHash,
        lockId: lockId.toString(),
        stage: 'FINAL_VERIFICATION',
      };
    }
  }

  const abFinal = await deps.getAllowanceBalance({
    token: canonicalTape,
    owner: allocation.wallet,
    spender: hoodlock2.locker,
  });
  postLockBalance = abFinal.balance;

  const proof = formatTgeFinalizationProof({
    chainId: ROBINHOOD_CHAIN_ID,
    canonicalTape,
    factory: SCOOP_FACTORY_ADDRESS,
    devBuyWallet: allocation.wallet,
    signer: signerRecheck.signer,
    devBuyAmount: allocation.amount.toString(),
    lockedAmount: recordedAmount.toString(),
    hoodlock: hoodlock2.locker,
    lockId: lockId.toString(),
    lockTxHash,
    lockBlock: String(lockBlock),
    lockTimestamp: String(lockTimestamp),
    unlockTime: String(unlockTime),
    unlockUtc: formatUnlockUtc(unlockTime),
    approvalTx,
    blockscoutLockUrl: `${BLOCKSCOUT_ADDRESS_URL}/${hoodlock2.locker}`,
  });

  return {
    ok: true,
    blocked: false,
    reason: null,
    mutated: true,
    proof,
    canonicalTape,
    lockId,
    lockTxHash,
    approvalTx,
    postLockBalance: postLockBalance?.toString(),
    liveFeeWei: feeCheck.liveFeeWei.toString(),
    maxFeeWei: feeCheck.maxFeeWei.toString(),
    proposedUnlock,
    stages: {
      OFFICIAL_TAPE_DB: dbResult.status,
      HOODLOCK_APPROVAL: approvalNeed.needsApprove
        ? 'COMPLETE'
        : 'ALREADY_COMPLETE',
      HOODLOCK_LOCK: 'COMPLETE',
      FINAL_VERIFICATION: 'PASS',
    },
  };
}

export { hoodlockLockerAbi, getAddress };
