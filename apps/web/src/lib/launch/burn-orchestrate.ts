/**
 * Exact dev-allocation burn after a confirmed Pons launch.
 * Amount is persisted devTokensOut. Destination is the canonical dead address.
 * Broadcast is injected so tests never hit a wallet.
 */
import type { PublicClient, TransactionReceipt } from 'viem';
import { decodeEventLog, getAddress, parseAbiItem } from 'viem';
import { PonsAdapterError } from '@/lib/launch/adapters/pons/errors';
import { erc20ApproveAbi } from '@/lib/launch/adapters/pons/hoodlock-abi';
import {
  decimalToBigint,
  isLaunchCommitted,
  type PonsPendingLaunchState,
} from '@/lib/launch/adapters/pons/lifecycle-types';
import {
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from '@/lib/launch/adapters/pons/pending-storage';
import {
  DEV_SUPPLY_BURN_ADDRESS,
  resolveDevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';

export const erc20TransferAbi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export type BurnTransferRequest = {
  address: `0x${string}`;
  abi: typeof erc20TransferAbi;
  functionName: 'transfer';
  args: readonly [`0x${string}`, bigint];
  account: `0x${string}`;
};

export type BurnRecoveryOutcome =
  | 'BURN_PENDING'
  | 'BURN_REVERTED'
  | 'BURN_CONFIRMED_RECOVERED'
  | 'BURN_ALREADY_VERIFIED'
  | 'BURN_RECOVERY_UNRESOLVED'
  | 'NOTHING_TO_RECOVER';

export type BurnRecoverResult = {
  outcome: BurnRecoveryOutcome;
  state: PonsPendingLaunchState;
  receipt: TransactionReceipt | null;
};

function now(): number {
  return Date.now();
}

function requireExactDevTokens(state: PonsPendingLaunchState): bigint {
  const amount = decimalToBigint(state.devTokensOut);
  if (amount == null || amount <= BigInt(0)) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Exact dev token allocation missing. Resume launch recovery before burning.',
    );
  }
  return amount;
}

function assertBurnPolicy(state: PonsPendingLaunchState): void {
  if (resolveDevSupplyPolicy(state.devSupplyPolicy) !== 'burn') {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Dev supply policy is not burn.',
    );
  }
  if (!isLaunchCommitted(state) || !state.tokenAddress) {
    throw new PonsAdapterError(
      'INVALID_INPUT',
      'Pons launch must be confirmed before burning dev supply.',
    );
  }
}

export function verifyBurnTransferReceipt(args: {
  receipt: TransactionReceipt;
  token: `0x${string}`;
  from: `0x${string}`;
  amount: bigint;
}): void {
  if (args.receipt.status !== 'success') {
    throw new PonsAdapterError(
      'BURN_VERIFY_FAILED',
      'Burn transaction did not succeed.',
    );
  }
  const token = getAddress(args.token);
  const from = getAddress(args.from);
  const to = getAddress(DEV_SUPPLY_BURN_ADDRESS);
  for (const log of args.receipt.logs) {
    if (getAddress(log.address) !== token) continue;
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'Transfer') continue;
      const event = decoded.args;
      if (
        getAddress(event.from) === from &&
        getAddress(event.to) === to &&
        event.value === args.amount
      ) {
        return;
      }
    } catch {
      continue;
    }
  }
  throw new PonsAdapterError(
    'BURN_VERIFY_FAILED',
    'Burn receipt is missing an exact Transfer of devTokensOut to the burn address.',
  );
}

function markBurnVerified(
  state: PonsPendingLaunchState,
  verifiedAt: number,
): PonsPendingLaunchState {
  const next: PonsPendingLaunchState = {
    ...state,
    phase: 'burn_verified',
    burnVerified: true,
    burnVerifiedAt: verifiedAt,
    lastError: null,
    updatedAt: now(),
  };
  savePonsPendingLaunch(next);
  return next;
}

async function getReceiptOrNull(
  publicClient: PublicClient,
  hash: `0x${string}`,
): Promise<TransactionReceipt | null> {
  try {
    return await publicClient.getTransactionReceipt({ hash });
  } catch {
    return null;
  }
}

export async function recoverBurnFromPending(args: {
  publicClient: PublicClient;
  draftId: string;
}): Promise<BurnRecoverResult> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertBurnPolicy(state);
  if (state.burnVerified === true) {
    return { outcome: 'BURN_ALREADY_VERIFIED', state, receipt: null };
  }
  if (!state.burnTxHash) {
    return { outcome: 'NOTHING_TO_RECOVER', state, receipt: null };
  }

  const receipt = await getReceiptOrNull(args.publicClient, state.burnTxHash);
  if (!receipt) {
    return { outcome: 'BURN_PENDING', state, receipt: null };
  }

  if (receipt.status === 'reverted') {
    const next: PonsPendingLaunchState = {
      ...state,
      phase: 'recoverable_failure',
      burnTxHash: null,
      lastError: {
        code: 'TX_REVERTED',
        message:
          'Burn transaction reverted. Token is live — retry the burn only. Do not launch again.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    return { outcome: 'BURN_REVERTED', state: next, receipt };
  }

  try {
    const amount = requireExactDevTokens(state);
    verifyBurnTransferReceipt({
      receipt,
      token: getAddress(state.tokenAddress!) as `0x${string}`,
      from: getAddress(state.creator) as `0x${string}`,
      amount,
    });
    const verified = markBurnVerified(state, now());
    return {
      outcome: 'BURN_CONFIRMED_RECOVERED',
      state: verified,
      receipt,
    };
  } catch (e) {
    const next: PonsPendingLaunchState = {
      ...state,
      phase: 'recoverable_failure',
      lastError: {
        code: 'BURN_VERIFY_FAILED',
        message:
          e instanceof PonsAdapterError
            ? e.message
            : 'Burn confirmed but could not be verified.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    return { outcome: 'BURN_RECOVERY_UNRESOLVED', state: next, receipt };
  }
}

export async function broadcastBurnDevSupply(args: {
  publicClient: PublicClient;
  draftId: string;
  writeContract: (request: BurnTransferRequest) => Promise<`0x${string}`>;
  waitForReceipt?: (hash: `0x${string}`) => Promise<TransactionReceipt>;
}): Promise<{ state: PonsPendingLaunchState; burnTxHash: `0x${string}` }> {
  const state = loadPonsPendingLaunch(args.draftId);
  if (!state) {
    throw new PonsAdapterError('INVALID_INPUT', 'Unknown Pons launch draft.');
  }
  assertBurnPolicy(state);
  if (state.burnVerified === true) {
    return { state, burnTxHash: state.burnTxHash ?? ('0x' + '00'.repeat(32)) as `0x${string}` };
  }
  if (state.burnTxHash) {
    throw new PonsAdapterError(
      'TX_PENDING',
      'Burn transaction already submitted. Checking its status…',
    );
  }

  const amount = requireExactDevTokens(state);
  const token = getAddress(state.tokenAddress!) as `0x${string}`;
  const creator = getAddress(state.creator) as `0x${string}`;
  const burnTo = getAddress(DEV_SUPPLY_BURN_ADDRESS) as `0x${string}`;

  const balance = (await args.publicClient.readContract({
    address: token,
    abi: erc20ApproveAbi,
    functionName: 'balanceOf',
    args: [creator],
  })) as bigint;
  if (balance < amount) {
    throw new PonsAdapterError(
      'INSUFFICIENT_TOKEN_BALANCE',
      'Creator token balance is below the exact launch allocation to burn.',
    );
  }

  let request: BurnTransferRequest;
  try {
    const simulated = await args.publicClient.simulateContract({
      address: token,
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [burnTo, amount],
      account: creator,
    });
    request = {
      address: token,
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: simulated.request.args,
      account: creator,
    };
  } catch (e) {
    throw new PonsAdapterError(
      'BURN_SIMULATION_FAILED',
      e instanceof Error ? e.message : 'Burn transfer simulation failed.',
    );
  }

  const hash = await args.writeContract(request);
  let next: PonsPendingLaunchState = {
    ...state,
    phase: 'burn_submitted',
    burnTxHash: hash,
    lastError: null,
    updatedAt: now(),
  };
  try {
    savePonsPendingLaunch(next);
  } catch (e) {
    throw new PonsAdapterError(
      'PERSISTENCE_FAILED',
      'Burn was submitted but recovery state could not be saved. Do not relaunch.',
      { cause: { burnTxHash: hash, draftId: args.draftId, e } },
    );
  }

  next = { ...next, phase: 'burn_confirming', updatedAt: now() };
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
      lastError: {
        code: 'TX_REVERTED',
        message:
          'Burn transaction reverted. Token is live — retry the burn only. Do not launch again.',
      },
      updatedAt: now(),
    };
    savePonsPendingLaunch(next);
    throw new PonsAdapterError('TX_REVERTED', next.lastError!.message, {
      cause: { burnTxHash: hash },
    });
  }

  next = { ...next, phase: 'burn_verifying', updatedAt: now() };
  savePonsPendingLaunch(next);

  verifyBurnTransferReceipt({
    receipt,
    token,
    from: creator,
    amount,
  });

  next = markBurnVerified(next, now());
  return { state: next, burnTxHash: hash };
}

export function burnFundingNote(): string {
  return 'Required ETH: Pons launch fee + dev buy + gas. HoodLock fee is not charged.';
}

export function lockFundingNote(): string {
  return 'Required ETH: Pons launch fee + dev buy + HoodLock fee + gas.';
}
