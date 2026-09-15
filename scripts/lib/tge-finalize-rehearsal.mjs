/**
 * Phase 1 TGE finalizer — rehearsal orchestration only.
 * This module must never import DB upsert / wallet send / private-key helpers.
 */
import { formatEther, getAddress } from 'viem';
import {
  BLOCKSCOUT_ADDRESS_URL,
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  TGE_DEV_BUY_LOCK_CALENDAR_MONTHS,
  TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
} from './tge-constants.mjs';
import {
  buildExactApprovalIntent,
  buildHoodlockLockIntent,
  classifyApprovalNeed,
  classifyExistingHoodlockLocks,
  decodeHoodlockLockCalldata,
  verifyHoodlockDeployment,
} from './hoodlock.mjs';
import {
  classifyDevAllocationFromInitialBuyEvents,
  resolveDevBuyWalletIdentity,
} from './tge-dev-allocation.mjs';
import {
  classifyOfficialTapeDbState,
  resolveCanonicalTapeAfterDbStage,
} from './tge-protocol-settings-read.mjs';
import {
  classifyScoopLaunchedTokenModel,
  hoodlockCompatibilityForModel,
} from './tge-token-model.mjs';
import {
  formatUnlockUtc,
  minimumUnlockUnixFromReference,
  proposeUnlockUnix,
  unlockSatisfiesDevBuyLockPolicy,
} from './tge-unlock-policy.mjs';
import {
  normalizeTapeAddress,
  verifyTapeIdentityForTge,
} from './tge-identity.mjs';

/**
 * @typedef {'NOT_STARTED' | 'ALREADY_COMPLETE' | 'READY' | 'BLOCKED' | 'FAILED'} StageStatus
 */

/**
 * Pure stage classifier for resumability (no I/O).
 * @param {{
 *   identityOk: boolean,
 *   dbClassification: 'UNSET' | 'SAME_AS_CANDIDATE' | 'DIFFERENT_FROM_CANDIDATE',
 *   allocationStatus: string,
 *   hoodlockOk: boolean,
 *   approvalStatus: 'NOT_STARTED' | 'ALREADY_COMPLETE' | 'READY' | 'BLOCKED',
 *   existingLockStatus: 'NOT_STARTED' | 'ALREADY_COMPLETE' | 'BLOCKED',
 * }} ctx
 */
export function classifyFinalizerStages(ctx) {
  /** @type {Record<string, { status: StageStatus, detail?: string }>} */
  const stages = {};

  stages.PRECHECK = {
    status: ctx.identityOk && ctx.hoodlockOk ? 'READY' : 'BLOCKED',
  };

  if (ctx.dbClassification === 'DIFFERENT_FROM_CANDIDATE') {
    stages.OFFICIAL_TAPE_DB = {
      status: 'BLOCKED',
      detail: 'BLOCKED — EXISTING OFFICIAL TAPE ADDRESS DIFFERS',
    };
  } else if (ctx.dbClassification === 'SAME_AS_CANDIDATE') {
    stages.OFFICIAL_TAPE_DB = { status: 'ALREADY_COMPLETE' };
  } else {
    stages.OFFICIAL_TAPE_DB = { status: 'READY' };
  }

  if (ctx.allocationStatus === 'READY') {
    stages.DEV_ALLOCATION = { status: 'READY' };
  } else if (ctx.allocationStatus === 'NOT_YET_PROVABLE') {
    stages.DEV_ALLOCATION = {
      status: 'BLOCKED',
      detail: 'DEV ALLOCATION: NOT YET PROVABLE WITHOUT LIVE TAPE LAUNCH',
    };
  } else if (ctx.allocationStatus === 'BLOCKED') {
    stages.DEV_ALLOCATION = { status: 'BLOCKED' };
  } else {
    stages.DEV_ALLOCATION = { status: 'NOT_STARTED' };
  }

  if (ctx.existingLockStatus === 'ALREADY_COMPLETE') {
    stages.HOODLOCK_APPROVAL = { status: 'ALREADY_COMPLETE' };
    stages.HOODLOCK_LOCK = { status: 'ALREADY_COMPLETE' };
  } else if (ctx.existingLockStatus === 'BLOCKED') {
    stages.HOODLOCK_APPROVAL = { status: 'BLOCKED' };
    stages.HOODLOCK_LOCK = {
      status: 'BLOCKED',
      detail: 'BLOCKED — AMBIGUOUS EXISTING TAPE LOCKS',
    };
  } else {
    stages.HOODLOCK_APPROVAL = {
      status:
        ctx.approvalStatus === 'ALREADY_COMPLETE'
          ? 'ALREADY_COMPLETE'
          : ctx.approvalStatus === 'READY'
            ? 'READY'
            : ctx.approvalStatus === 'BLOCKED'
              ? 'BLOCKED'
              : 'NOT_STARTED',
    };
    stages.HOODLOCK_LOCK = {
      status:
        stages.DEV_ALLOCATION.status === 'READY' &&
        (stages.HOODLOCK_APPROVAL.status === 'READY' ||
          stages.HOODLOCK_APPROVAL.status === 'ALREADY_COMPLETE') &&
        ctx.hoodlockOk
          ? 'READY'
          : 'BLOCKED',
    };
  }

  stages.FINAL_VERIFICATION = {
    status:
      stages.HOODLOCK_LOCK.status === 'ALREADY_COMPLETE' ? 'READY' : 'NOT_STARTED',
  };

  return stages;
}

/**
 * Run Phase 1 rehearsal with injectable deps (tests) or live read-only clients (CLI).
 *
 * @param {{
 *   candidateRaw: string,
 *   chainTimestampUnix?: number,
 *   configuredDevBuyWallet?: string | null,
 *   identity?: Awaited<ReturnType<typeof verifyTapeIdentityForTge>>,
 *   verifyIdentity?: typeof verifyTapeIdentityForTge,
 *   existingOfficialTape?: `0x${string}` | null,
 *   hoodlock?: Awaited<ReturnType<typeof verifyHoodlockDeployment>>,
 *   verifyHoodlock?: typeof verifyHoodlockDeployment,
 *   initialBuyEvents?: Array<{
 *     token: string,
 *     deployer: string,
 *     tokensOut: bigint,
 *     quoteAmountIn: bigint,
 *   }>,
 *   allowance?: bigint | null,
 *   balance?: bigint | null,
 *   existingLocks?: Array<{
 *     id: bigint | number,
 *     owner: string,
 *     token: string,
 *     amount: bigint,
 *     unlockTime: bigint | number,
 *     withdrawn: boolean,
 *   }>,
 *   rpcUrl?: string,
 *   identityClient?: unknown,
 *   hoodlockClient?: unknown,
 * }} input
 */
export async function runTgeFinalizeRehearsal(input) {
  const tokenModel = classifyScoopLaunchedTokenModel();
  const modelCompat = hoodlockCompatibilityForModel({ model: tokenModel.model });

  const walletIdentity = resolveDevBuyWalletIdentity({
    configuredWallet: input.configuredDevBuyWallet ?? null,
  });

  /** @type {Awaited<ReturnType<typeof verifyTapeIdentityForTge>>} */
  let identity;
  if (input.identity) {
    identity = input.identity;
  } else {
    const addr = normalizeTapeAddress(input.candidateRaw);
    if (!addr) {
      identity = { ok: false, reason: 'Invalid EVM address.' };
    } else {
      identity = await (input.verifyIdentity ?? verifyTapeIdentityForTge)({
        address: addr,
        rpcUrl: input.rpcUrl,
        client: /** @type {any} */ (input.identityClient),
      });
    }
  }

  const candidate = identity && identity.ok ? identity.address : null;

  const dbClassification = candidate
    ? classifyOfficialTapeDbState({
        existing: input.existingOfficialTape ?? null,
        candidate,
      })
    : 'UNSET';

  const canonicalResolution = candidate
    ? resolveCanonicalTapeAfterDbStage({
        dbClassification,
        candidate,
        existing: input.existingOfficialTape ?? null,
        emulatedReadBack: candidate,
      })
    : { status: 'BLOCKED', reason: 'No valid candidate', canonical: null };

  const canonicalTape =
    canonicalResolution.status === 'BLOCKED'
      ? null
      : canonicalResolution.canonical;

  const hoodlock =
    input.hoodlock ??
    (await (input.verifyHoodlock ?? verifyHoodlockDeployment)({
      rpcUrl: input.rpcUrl,
      client: /** @type {any} */ (input.hoodlockClient),
    }));

  const allocation =
    input.initialBuyEvents != null && candidate
      ? classifyDevAllocationFromInitialBuyEvents({
          events: input.initialBuyEvents,
          tapeAddress: candidate,
          expectedWallet: walletIdentity.wallet,
        })
      : {
          status: 'NOT_YET_PROVABLE',
          reason: 'DEV ALLOCATION: NOT YET PROVABLE WITHOUT LIVE TAPE LAUNCH',
          wallet: walletIdentity.wallet,
          amount: null,
          method: 'InitialBuyExecuted.tokensOut',
          events: [],
        };

  const chainTs =
    input.chainTimestampUnix ?? Math.floor(Date.now() / 1000);
  const proposedUnlock = proposeUnlockUnix({
    chainTimestampUnix: chainTs,
    safetyMarginSeconds: TGE_UNLOCK_SAFETY_MARGIN_SECONDS,
  });
  const minUnlockFromNow = minimumUnlockUnixFromReference(chainTs);

  const lockOwner =
    allocation.status === 'READY'
      ? allocation.wallet
      : walletIdentity.wallet;

  let existingLockStatus = 'NOT_STARTED';
  let existingLockDetail = null;
  if (
    canonicalTape &&
    lockOwner &&
    allocation.status === 'READY' &&
    allocation.amount != null &&
    input.existingLocks
  ) {
    const classified = classifyExistingHoodlockLocks({
      locks: input.existingLocks,
      canonicalTape,
      expectedOwner: lockOwner,
      expectedAmount: allocation.amount,
      minimumUnlockUnix: minUnlockFromNow,
    });
    existingLockStatus = classified.status;
    existingLockDetail = classified.reason ?? null;
  }

  let approvalStatus = 'NOT_STARTED';
  let approvalIntent = null;
  if (
    canonicalTape &&
    hoodlock.ok &&
    allocation.status === 'READY' &&
    allocation.amount != null
  ) {
    const allowance = input.allowance ?? 0n;
    const need = classifyApprovalNeed({
      currentAllowance: allowance,
      requiredAmount: allocation.amount,
    });
    approvalStatus = need.status;
    if (need.needsApprove) {
      approvalIntent = buildExactApprovalIntent({
        token: getAddress(canonicalTape),
        spender: getAddress(hoodlock.locker ?? HOODLOCK_LOCKER_ADDRESS),
        amount: allocation.amount,
      });
    }
  }

  let lockIntent = null;
  let simulation = {
    status: 'BLOCKED BY MISSING LIVE TAPE',
    detail: null,
  };

  if (!identity?.ok) {
    simulation = { status: 'BLOCKED BY MISSING LIVE TAPE', detail: identity?.reason };
  } else if (allocation.status !== 'READY' || allocation.amount == null) {
    simulation = {
      status: 'BLOCKED BY MISSING LIVE TAPE',
      detail: allocation.reason,
    };
  } else if (
    input.allowance != null &&
    input.allowance < allocation.amount
  ) {
    simulation = {
      status: 'BLOCKED BY CURRENT ALLOWANCE',
      detail: `allowance ${input.allowance} < amount ${allocation.amount}`,
    };
  } else if (hoodlock.ok && canonicalTape && allocation.amount != null) {
    lockIntent = buildHoodlockLockIntent({
      token: getAddress(canonicalTape),
      amount: allocation.amount,
      unlockTime: proposedUnlock,
      feeWei: hoodlock.fee,
      lockerAddress: hoodlock.locker,
    });
    // Rehearsal does not eth_call lock by default when deps incomplete; mark SIMULATABLE NOW only if allowance+balance ok
    if (
      input.allowance != null &&
      input.allowance >= allocation.amount &&
      input.balance != null &&
      input.balance >= allocation.amount
    ) {
      simulation = {
        status: 'SIMULATABLE NOW',
        detail:
          'Phase 1 does not broadcast; future mutation must eth_call after approval receipt.',
      };
    } else if (input.allowance == null && input.balance == null) {
      simulation = {
        status: 'OTHER',
        detail: 'Allowance/balance not supplied in this rehearsal context',
      };
    }
  }

  const stages = classifyFinalizerStages({
    identityOk: Boolean(identity?.ok),
    dbClassification,
    allocationStatus: allocation.status,
    hoodlockOk: Boolean(hoodlock.ok),
    approvalStatus,
    existingLockStatus,
  });

  const policyCheck = unlockSatisfiesDevBuyLockPolicy({
    unlockTimeUnix: proposedUnlock,
    lockTimeReferenceUnix: chainTs,
  });

  return {
    phase: 1,
    mutationEnabled: false,
    chainId: ROBINHOOD_CHAIN_ID,
    identity,
    candidate,
    dbClassification,
    canonicalResolution,
    canonicalTape,
    walletIdentity,
    allocation,
    tokenModel,
    hoodlockCompatibility: modelCompat,
    hoodlock,
    proposedUnlock,
    proposedUnlockUtc: formatUnlockUtc(proposedUnlock),
    minUnlockFromNow,
    policyCheck,
    approvalStatus,
    approvalIntent,
    lockIntent,
    lockIntentDecoded: lockIntent
      ? decodeHoodlockLockCalldata(lockIntent.data)
      : null,
    simulation,
    existingLockStatus,
    existingLockDetail,
    stages,
    lockOwnerPolicy: {
      ownerIsMsgSender: true,
      expectedOwner: lockOwner,
      note:
        'HoodLock lock() sets owner = msg.sender. Finalizer must be signed by the wallet that holds the dev-buy TAPE. No ownership transfer in TGE finalization.',
    },
    blockscoutLockerUrl: `${BLOCKSCOUT_ADDRESS_URL}/${HOODLOCK_LOCKER_ADDRESS}`,
  };
}

/**
 * Format rehearsal preview for the operator terminal.
 * @param {Awaited<ReturnType<typeof runTgeFinalizeRehearsal>>} r
 */
export function formatTgeFinalizePreview(r) {
  const check = (ok) => (ok ? '✓' : '✗');
  const lines = [];
  lines.push('══════════════════════════════════════');
  lines.push('      TAPE TGE FINALIZER — PREVIEW');
  lines.push('══════════════════════════════════════');
  lines.push('');
  lines.push('Network');
  lines.push(
    `  Robinhood Chain (${r.chainId})          ${check(r.chainId === 4663)}`,
  );
  lines.push('');
  lines.push('Official TAPE candidate');
  if (!r.identity?.ok) {
    const shown =
      r.identity && 'address' in r.identity && r.identity.address
        ? r.identity.address
        : r.candidate ?? '(invalid)';
    lines.push(`  Address: ${shown}`);
    lines.push(`  Identity: FAILED — ${r.identity?.reason ?? 'unknown'}`);
  } else {
    lines.push(`  Address: ${r.identity.address}`);
    lines.push(
      `  Symbol: ${r.identity.symbol ?? '(unreadable)'}                    ${check(r.identity.symbol === 'TAPE')}`,
    );
    lines.push(
      `  Name: ${r.identity.name ?? '(unreadable)'}`,
    );
    lines.push(
      `  Decimals: ${r.identity.decimals ?? '(unreadable)'}`,
    );
    lines.push(
      `  TotalSupply: ${r.identity.totalSupply != null ? r.identity.totalSupply.toString() : '(unreadable)'}`,
    );
    lines.push(
      `  Bytecode: present (${r.identity.bytecodeLength} bytes)               ${check(true)}`,
    );
  }
  lines.push('');
  lines.push('Protocol DB');
  lines.push(`  Current: ${r.dbClassification}`);
  if (r.dbClassification === 'DIFFERENT_FROM_CANDIDATE') {
    lines.push('  Planned: BLOCKED — will not override via finalizer');
  } else if (r.dbClassification === 'SAME_AS_CANDIDATE') {
    lines.push(`  Planned: verify existing ${r.canonicalTape}`);
  } else {
    lines.push(
      `  Planned: set to ${r.canonicalTape ?? r.candidate ?? '(blocked — no valid candidate)'}`,
    );
  }
  lines.push('  WRITE: NO — PREVIEW ONLY');
  lines.push(
    `  Production execution armed: ${r.productionArmed === true ? 'YES' : r.productionArmed === false ? 'NO' : '(unknown)'}`,
  );
  if (r.canonicalTape) {
    lines.push(
      `  Canonical (post-DB emulation): ${r.canonicalTape}`,
    );
  }
  lines.push('');
  lines.push('Signer');
  lines.push(
    `  Address: ${r.signerConfigured ? r.signerAddress : 'NOT CONFIGURED YET'}`,
  );
  lines.push(
    `  Signer/dev-buy match: ${r.signerDevBuyMatch ?? 'PENDING'}`,
  );  lines.push('');
  lines.push('Dev allocation');
  lines.push(`  Rule: ${r.walletIdentity.rule}`);
  lines.push(
    `  Configured wallet: ${r.walletIdentity.wallet ?? '(none — resolve from InitialBuyExecuted)'}`,
  );
  lines.push(`  Detection: ${r.allocation.method}`);
  lines.push(`  Status: ${r.allocation.status}`);
  if (r.allocation.amount != null) {
    lines.push(`  Amount (tokensOut): ${r.allocation.amount.toString()}`);
    lines.push(`  Wallet: ${r.allocation.wallet}`);
  } else {
    lines.push(
      `  Amount: ${r.allocation.reason ?? 'NOT YET AVAILABLE'}`,
    );
  }
  lines.push('');
  lines.push('TAPE token model');
  lines.push(`  TAPE TOKEN MODEL: ${r.tokenModel.model}`);
  lines.push(`  HOODLOCK COMPATIBILITY: ${r.hoodlockCompatibility}`);
  lines.push(`  Trading fees: ${r.tokenModel.tradingFees}`);
  lines.push('');
  lines.push('HoodLock');
  if (!r.hoodlock.ok) {
    lines.push(`  Status: FAILED — ${r.hoodlock.reason}`);
  } else {
    lines.push(
      `  Address: ${r.hoodlock.locker}          ${check(true)}`,
    );
    lines.push(
      `  Code hash: VERIFIED (${r.hoodlock.codeSha256.slice(0, 12)}…)          ${check(true)}`,
    );
    lines.push(
      `  Live fee: ${formatEther(r.hoodlock.fee)} ETH (${r.hoodlock.fee.toString()} wei)`,
    );
    if (r.feeSafety) {
      lines.push(
        `  Maximum permitted: ${r.feeSafety.maxFeeEth} ETH`,
      );
      lines.push(
        `  Fee safety check: ${r.feeSafety.ok ? 'PASS' : 'BLOCKED'}`,
      );
    } else if (r.maxFeeWei != null) {
      lines.push(
        `  Maximum permitted: ${formatEther(r.maxFeeWei)} ETH`,
      );
    }
    lines.push(`  Admin: ${r.hoodlock.admin}`);
    lines.push(`  FeeCollector: ${r.hoodlock.feeCollector}`);
  }
  lines.push('');
  lines.push('Lock policy');
  lines.push('  100% of InitialBuyExecuted.tokensOut (when provable)');
  lines.push(
    `  Duration: ${TGE_DEV_BUY_LOCK_CALENDAR_MONTHS} calendar months minimum`,
  );
  lines.push(
    `  Proposal margin: +${TGE_UNLOCK_SAFETY_MARGIN_SECONDS}s (construction only)`,
  );
  lines.push(`  Proposed unlock: ${r.proposedUnlockUtc} (unix ${r.proposedUnlock})`);
  lines.push(
    `  Policy vs chain now: ${r.policyCheck.ok ? 'SATISFIED' : 'FAIL'}`,
  );
  lines.push('');
  lines.push('Lock owner');
  lines.push(`  ${r.lockOwnerPolicy.note}`);
  lines.push(
    `  Expected owner: ${r.lockOwnerPolicy.expectedOwner ?? '(pending)'}`,
  );
  lines.push('');
  lines.push('Approval');
  lines.push(`  Spender: HoodLock (${HOODLOCK_LOCKER_ADDRESS})`);
  lines.push(`  Status: ${r.approvalStatus}`);
  if (r.approvalIntent) {
    lines.push(`  Amount: ${r.approvalIntent.amount.toString()} (exact; not unlimited)`);
  }
  lines.push('  BROADCAST: NO');
  lines.push('');
  lines.push('Lock');
  lines.push(`  Existing lock: ${r.existingLockStatus}${r.existingLockDetail ? ` — ${r.existingLockDetail}` : ''}`);
  lines.push(`  Simulation: ${r.simulation.status}`);
  if (r.lockIntent) {
    lines.push('');
    lines.push('HOODLOCK LOCK INTENT');
    lines.push(`  Chain:          Robinhood Chain (${r.lockIntent.chainId})`);
    lines.push(`  Locker:         ${r.lockIntent.to}`);
    lines.push(`  Token:          ${r.lockIntent.token}`);
    lines.push(`  Amount:         ${r.lockIntent.amount.toString()}`);
    lines.push(`  Unlock:         ${r.lockIntent.unlockTime.toString()} (${formatUnlockUtc(Number(r.lockIntent.unlockTime))})`);
    lines.push(
      `  Fee:            ${formatEther(r.lockIntent.value)} ETH (LIVE READ)`,
    );
    lines.push(`  Data:           ${r.lockIntent.data.slice(0, 18)}…`);
  }
  lines.push('  BROADCAST: NO');
  lines.push('');
  lines.push('Stages');
  for (const [name, stage] of Object.entries(r.stages)) {
    lines.push(
      `  ${name}: ${stage.status}${stage.detail ? ` — ${stage.detail}` : ''}`,
    );
  }
  lines.push('');
  lines.push('══════════════════════════════════════');
  lines.push('PREVIEW COMPLETE — NOTHING WAS CHANGED');
  lines.push('══════════════════════════════════════');
  return lines.join('\n');
}
