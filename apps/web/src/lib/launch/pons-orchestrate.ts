/**
 * Pons LaunchAndBuy lifecycle orchestrator (Gate 4 / Gate 7).
 * Composes Gate 3 adapter. Wired to public /launch via run-public-pons-launch.
 *
 * Broadcast is injected via `writeContract` so unit tests never hit chain.
 */
import type { PublicClient, TransactionReceipt, WalletClient } from 'viem';
import { getAddress } from 'viem';
import {
  PONS_DEV_BUY_SLIPPAGE_BPS,
  PONS_LAUNCH_CONFIG_ID,
  PONS_NATIVE_PAIR_TOKEN,
  PONS_V2_CHAIN_ID,
} from '@/lib/launch/adapters/pons/constants';
import { simulatePonsLaunchAndBuy } from '@/lib/launch/adapters/pons/simulate';
import { runPonsPreflight } from '@/lib/launch/adapters/pons/preflight';
import { decodePonsLaunchAndBuyReceipt } from '@/lib/launch/adapters/pons/decode-receipt';
import { resolvePonsSalt } from '@/lib/launch/adapters/pons/salt';
import { PonsAdapterError } from '@/lib/launch/adapters/pons/errors';
import {
  bigintToDecimal,
  decimalToBigint,
  emptyHoodlockFields,
  isLaunchCommitted,
  type PonsPendingLaunchState,
} from '@/lib/launch/adapters/pons/lifecycle-types';
import {
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from '@/lib/launch/adapters/pons/pending-storage';
import { assertPonsRelaunchAllowed } from '@/lib/launch/adapters/pons/relaunch-guard';
import {
  DEFAULT_DEV_SUPPLY_POLICY,
  resolveDevSupplyPolicy,
  type DevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';
import type {
  PonsLaunchAdapterInput,
  PonsLaunchAndBuyRequest,
} from '@/lib/launch/adapters/pons/types';

export type PonsOrchestratePrepareResult = {
  state: PonsPendingLaunchState;
  request: PonsLaunchAndBuyRequest;
  simulatedTokensOut: bigint;
  minTokensOut: bigint;
};

export type PonsOrchestrateBroadcastResult = {
  state: PonsPendingLaunchState;
  ponsTxHash: `0x${string}`;
  receipt: TransactionReceipt;
};

function now(): number {
  return Date.now();
}

function requireQuoteIn(state: PonsPendingLaunchState): bigint {
  const q = decimalToBigint(state.quoteInWei);
  if (q == null || q <= BigInt(0)) {
    throw new PonsAdapterError('ZERO_DEV_BUY', 'Dev buy amount missing from draft.');
  }
  return q;
}

function toAdapterInput(state: PonsPendingLaunchState): PonsLaunchAdapterInput {
  return {
    creator: state.creator,
    name: state.name,
    symbol: state.symbol,
    logo: state.logo,
    description: state.description,
    twitter: state.twitter,
    telegram: state.telegram,
    website: state.website,
    discord: state.discord,
    farcaster: state.farcaster,
    creatorTaxBps: state.creatorTaxBps,
    buybackEnabled: state.buybackEnabled,
    quoteInWei: requireQuoteIn(state),
    slippageBps: state.slippageBps,
    salt: state.salt,
  };
}

export type CreatePonsDraftInput = {
  draftId: string;
  creator: `0x${string}`;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  farcaster?: string;
  quoteInWei: bigint;
  creatorTaxBps: number;
  buybackEnabled: boolean;
  slippageBps?: number;
  /** Optional pre-existing salt (resume). */
  salt?: `0x${string}`;
  /** Persisted before broadcast. Ignored once ponsTxHash exists. */
  devSupplyPolicy?: DevSupplyPolicy;
};

/**
 * Create or resume a draft. Generates+persists salt immediately.
 * If draft already launch-committed, returns existing state without changing salt.
 */
export function createOrResumePonsDraft(
  input: CreatePonsDraftInput,
): PonsPendingLaunchState {
  const existing = loadPonsPendingLaunch(input.draftId);
  if (existing) {
    if (isLaunchCommitted(existing)) {
      return {
        ...existing,
        devSupplyPolicy: resolveDevSupplyPolicy(existing.devSupplyPolicy),
      };
    }
    const policy = resolveDevSupplyPolicy(
      input.devSupplyPolicy ?? existing.devSupplyPolicy,
    );
    const fee = input.creatorTaxBps;
    if (existing.devSupplyPolicy === policy && existing.creatorTaxBps === fee) {
      return existing;
    }
    const next: PonsPendingLaunchState = {
      ...existing,
      devSupplyPolicy: policy,
      creatorTaxBps: fee,
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    return next;
  }

  const creator = getAddress(input.creator) as `0x${string}`;
  const salt = resolvePonsSalt(input.salt);
  const createdAt = now();
  const state: PonsPendingLaunchState = {
    version: 1,
    draftId: input.draftId,
    phase: 'draft',
    creator,
    chainId: PONS_V2_CHAIN_ID,
    salt,
    launchConfigId: bigintToDecimal(PONS_LAUNCH_CONFIG_ID),
    pairToken: PONS_NATIVE_PAIR_TOKEN,
    quoteInWei: bigintToDecimal(input.quoteInWei),
    slippageBps: input.slippageBps ?? PONS_DEV_BUY_SLIPPAGE_BPS,
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buybackEnabled,
    name: input.name,
    symbol: input.symbol,
    logo: input.logo,
    description: input.description,
    twitter: input.twitter ?? '',
    telegram: input.telegram ?? '',
    website: input.website ?? '',
    discord: input.discord ?? '',
    farcaster: input.farcaster ?? '',
    expectedEconomics: null,
    launchFeeWei: null,
    requiredMsgValueWei: null,
    simulatedTokenAddress: null,
    simulatedCurveAddress: null,
    simulatedTokensOut: null,
    minTokensOut: null,
    ponsTxHash: null,
    tokenAddress: null,
    curveAddress: null,
    devTokensOut: null,
    actualQuoteIn: null,
    refundWei: null,
    receiptBlockNumber: null,
    lastError: null,
    ...emptyHoodlockFields(),
    devSupplyPolicy: resolveDevSupplyPolicy(
      input.devSupplyPolicy ?? DEFAULT_DEV_SUPPLY_POLICY,
    ),
    burnTxHash: null,
    burnVerified: null,
    burnVerifiedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  savePonsPendingLaunch(state);
  return state;
}

/**
 * Preflight + two-stage simulation → ready_to_sign.
 * Safe to retry when only salt is persisted (no tx hash).
 */
export async function preparePonsLaunchAndBuy(args: {
  publicClient: PublicClient;
  draftId: string;
  chainId: number;
}): Promise<PonsOrchestratePrepareResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }

  assertPonsRelaunchAllowed(state);

  // Already resolved → Gate 5 boundary
  if (state.tokenAddress && state.curveAddress && state.devTokensOut) {
    const lockState: PonsPendingLaunchState = {
      ...state,
      phase: 'lock_required',
      updatedAt: now(),
    };
    savePonsPendingLaunch(lockState);
    throw new PonsAdapterError(
      'RELAUNCH_BLOCKED',
      'Token already launched. Dev token lock still required.',
      {
        cause: {
          phase: 'lock_required',
          tokenAddress: state.tokenAddress,
          curveAddress: state.curveAddress,
          devTokensOut: state.devTokensOut,
        },
      },
    );
  }

  let next: PonsPendingLaunchState = {
    ...state,
    phase: 'preflight',
    lastError: null,
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const input = toAdapterInput(next);
  const preflight = await runPonsPreflight({
    publicClient: args.publicClient,
    chainId: args.chainId,
    input,
  });

  next = {
    ...next,
    phase: 'simulating',
    expectedEconomics: preflight.expectedEconomics,
    launchFeeWei: bigintToDecimal(preflight.launchFeeWei),
    requiredMsgValueWei: bigintToDecimal(preflight.requiredMsgValueWei),
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  const simulation = await simulatePonsLaunchAndBuy({
    publicClient: args.publicClient,
    input,
    preflight,
  });

  // Salt must remain the persisted one
  if (simulation.salt.toLowerCase() !== next.salt.toLowerCase()) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Simulation salt diverged from persisted draft salt.',
    );
  }

  next = {
    ...next,
    phase: 'ready_to_sign',
    simulatedTokenAddress: simulation.simulatedTokenAddress,
    simulatedCurveAddress: simulation.simulatedCurveAddress,
    simulatedTokensOut: bigintToDecimal(simulation.simulatedTokensOut),
    minTokensOut: bigintToDecimal(simulation.minTokensOut),
    expectedEconomics: simulation.expectedEconomics,
    launchFeeWei: bigintToDecimal(simulation.launchFeeWei),
    requiredMsgValueWei: bigintToDecimal(simulation.msgValueWei),
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  return {
    state: next,
    request: simulation.request,
    simulatedTokensOut: simulation.simulatedTokensOut,
    minTokensOut: simulation.minTokensOut,
  };
}

export type PonsWriteContractFn = (request: PonsLaunchAndBuyRequest) => Promise<`0x${string}`>;

/**
 * Broadcast LaunchAndBuy with hard ordering:
 * write → persist ponsTxHash IMMEDIATELY → wait receipt → decode → lock_required.
 */
export async function broadcastPonsLaunchAndBuy(args: {
  publicClient: PublicClient;
  draftId: string;
  request: PonsLaunchAndBuyRequest;
  writeContract: PonsWriteContractFn;
  /** Optional wait override for tests. */
  waitForReceipt?: (hash: `0x${string}`) => Promise<TransactionReceipt>;
}): Promise<PonsOrchestrateBroadcastResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertPonsRelaunchAllowed(state);

  let next: PonsPendingLaunchState = {
    ...state,
    phase: 'ready_to_sign',
    updatedAt: now(),
  };

  const hash = await args.writeContract(args.request);

  // HARD INVARIANT: persist tx hash before anything else.
  next = {
    ...next,
    phase: 'launch_submitted',
    ponsTxHash: hash,
    lastError: null,
    updatedAt: now(),
  };
  try {
    savePonsPendingLaunch(next);
  } catch (e) {
    // Persistence failed — retain hash in memory/error; never relaunch.
    throw new PonsAdapterError(
      'PERSISTENCE_FAILED',
      'Launch was submitted but local recovery state could not be saved. Do not launch again.',
      {
        cause: {
          ponsTxHash: hash,
          draftId: args.draftId,
          persistenceError: e,
        },
      },
    );
  }

  next = { ...next, phase: 'launch_confirming', updatedAt: now() };
  savePonsPendingLaunch(next);

  const wait =
    args.waitForReceipt ??
    ((h: `0x${string}`) =>
      args.publicClient.waitForTransactionReceipt({ hash: h }));

  const receipt = await wait(hash);

  if (receipt.status === 'reverted') {
    next = {
      ...next,
      phase: 'recoverable_failure',
      receiptBlockNumber: bigintToDecimal(receipt.blockNumber),
      lastError: {
        code: 'TX_REVERTED',
        message: 'Launch transaction reverted. Do not relaunch without review.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError('TX_REVERTED', next.lastError!.message, {
      cause: { ponsTxHash: hash },
    });
  }

  next = {
    ...next,
    phase: 'launch_confirmed',
    receiptBlockNumber: bigintToDecimal(receipt.blockNumber),
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);

  try {
    const decoded = decodePonsLaunchAndBuyReceipt({
      receipt,
      expectedCreator: state.creator,
    });

    next = {
      ...next,
      phase: 'token_resolved',
      tokenAddress: decoded.tokenAddress,
      curveAddress: decoded.curveAddress,
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);

    next = {
      ...next,
      phase: 'dev_allocation_resolved',
      devTokensOut: bigintToDecimal(decoded.actualTokensOut),
      actualQuoteIn: bigintToDecimal(decoded.actualQuoteIn),
      refundWei: bigintToDecimal(decoded.refundWei),
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);

    next = {
      ...next,
      phase: 'lock_required',
      lastError: null,
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);

    return { state: next, ponsTxHash: hash, receipt };
  } catch (e) {
    next = {
      ...next,
      phase: 'recoverable_failure',
      lastError: {
        code: 'RECEIPT_DECODE_FAILED',
        message:
          'Your token was launched, but SCOOP has not finished recovering the launch details. Do not launch again.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError(
      'RECEIPT_DECODE_FAILED',
      next.lastError!.message,
      { cause: { ponsTxHash: hash, decodeError: e } },
    );
  }
}

/**
 * Full prepare+broadcast helper for harnesses.
 * Not used by public /launch.
 */
export async function runPonsWalletLaunchLifecycle(args: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  draftId: string;
  chainId: number;
}): Promise<PonsOrchestrateBroadcastResult> {
  const prepared = await preparePonsLaunchAndBuy({
    publicClient: args.publicClient,
    draftId: args.draftId,
    chainId: args.chainId,
  });

  return broadcastPonsLaunchAndBuy({
    publicClient: args.publicClient,
    draftId: args.draftId,
    request: prepared.request,
    writeContract: async (request) => {
      const account = request.account;
      const hash = await args.walletClient.writeContract({
        address: request.address,
        abi: request.abi,
        functionName: request.functionName,
        args: [...request.args],
        value: request.value,
        account,
        chain: null,
      });
      return hash;
    },
  });
}
