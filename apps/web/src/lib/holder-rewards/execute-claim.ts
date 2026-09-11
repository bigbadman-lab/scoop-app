import {
  type Account,
  type Address,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
  decodeEventLog,
  type TransactionReceipt,
} from 'viem';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { scoopHolderRewardsAbi } from './abi';
import { verifyEntitlementProofAgainstRoot } from './derive-state';
import { readHolderRewardIsPaid, readHolderRewardRound } from './read-state';
import type { HolderRewardClaimSuccess, HolderRewardEntitlementDto } from './types';

export class HolderRewardClaimAccountChangedError extends Error {
  constructor(message = 'Wallet changed before claim. Retry.') {
    super(message);
    this.name = 'HolderRewardClaimAccountChangedError';
  }
}

export class HolderRewardClaimChainError extends Error {
  constructor(message = 'Switch to Robinhood Chain to claim.') {
    super(message);
    this.name = 'HolderRewardClaimChainError';
  }
}

export class HolderRewardClaimVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HolderRewardClaimVerificationError';
  }
}

export function verifyHolderRewardClaimedEvent(args: {
  receipt: TransactionReceipt;
  vault: Address;
  roundId: bigint;
  asset: Address;
  account: Address;
  amount: bigint;
}): { amount: bigint } {
  const vault = args.vault.toLowerCase();
  for (const log of args.receipt.logs) {
    if (log.address.toLowerCase() !== vault) continue;
    try {
      const decoded = decodeEventLog({
        abi: scoopHolderRewardsAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'HolderRewardClaimed') continue;
      const ev = decoded.args as {
        roundId?: bigint;
        asset?: Address;
        account?: Address;
        amount?: bigint;
      };
      if (
        ev.roundId === undefined ||
        !ev.asset ||
        !ev.account ||
        ev.amount === undefined
      ) {
        continue;
      }
      if (ev.roundId !== args.roundId) {
        throw new HolderRewardClaimVerificationError('HolderRewardClaimed roundId mismatch');
      }
      if (ev.asset.toLowerCase() !== args.asset.toLowerCase()) {
        throw new HolderRewardClaimVerificationError('HolderRewardClaimed asset mismatch');
      }
      if (ev.account.toLowerCase() !== args.account.toLowerCase()) {
        throw new HolderRewardClaimVerificationError('HolderRewardClaimed account mismatch');
      }
      if (ev.amount !== args.amount) {
        throw new HolderRewardClaimVerificationError('HolderRewardClaimed amount mismatch');
      }
      if (ev.amount <= BigInt(0)) {
        throw new HolderRewardClaimVerificationError('HolderRewardClaimed amount must be > 0');
      }
      return { amount: ev.amount };
    } catch (error) {
      if (error instanceof HolderRewardClaimVerificationError) throw error;
    }
  }
  throw new HolderRewardClaimVerificationError('HolderRewardClaimed event missing');
}

function assertRobinhoodChain(chainId: number | undefined | null): void {
  if (chainId == null || chainId !== ROBINHOOD_CHAIN_ID) {
    throw new HolderRewardClaimChainError();
  }
}

/**
 * Execute ScoopHolderRewards.claim with simulate → write → receipt → event verify.
 * Does not broadcast from tests; callers must supply live clients intentionally.
 */
export async function executeHolderRewardClaim(args: {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  entitlement: HolderRewardEntitlementDto;
  /** Captured at Claim click. */
  capturedWallet: Address;
  getLiveAccount: () => Address | undefined;
  getLiveChainId: () => number | undefined;
  onPhase?: (
    phase: 'simulating' | 'awaiting_wallet' | 'submitted' | 'confirming',
  ) => void;
}): Promise<HolderRewardClaimSuccess> {
  const entitlement = args.entitlement;
  const account = entitlement.account;
  const amount = BigInt(entitlement.entitlementRaw);
  const roundId = BigInt(entitlement.roundId);

  if (args.capturedWallet.toLowerCase() !== account.toLowerCase()) {
    throw new HolderRewardClaimVerificationError(
      'Connected wallet does not match entitlement account',
    );
  }

  assertRobinhoodChain(args.getLiveChainId());

  args.onPhase?.('simulating');

  const [round, isPaid] = await Promise.all([
    readHolderRewardRound({
      publicClient: args.publicClient,
      vault: entitlement.vault,
      roundId,
      asset: entitlement.asset,
    }),
    readHolderRewardIsPaid({
      publicClient: args.publicClient,
      vault: entitlement.vault,
      roundId,
      asset: entitlement.asset,
      account,
    }),
  ]);

  if (isPaid) {
    throw new HolderRewardClaimVerificationError('Already paid on-chain');
  }
  if (!round.published) {
    throw new HolderRewardClaimVerificationError('Round is not published on-chain');
  }

  const proofCheck = verifyEntitlementProofAgainstRoot({
    chainId: entitlement.chainId,
    vault: entitlement.vault,
    roundId,
    asset: entitlement.asset,
    account,
    amount,
    proof: entitlement.proof,
    storedLeafHash: entitlement.leafHash,
    workerMerkleRoot: entitlement.workerMerkleRoot,
    onChainRoot: round.merkleRoot,
  });
  if (!proofCheck.ok) {
    throw new HolderRewardClaimVerificationError(proofCheck.reason);
  }

  const simulated = await args.publicClient.simulateContract({
    address: entitlement.vault,
    abi: scoopHolderRewardsAbi,
    functionName: 'claim',
    args: [roundId, entitlement.asset, account, amount, entitlement.proof],
    account: args.capturedWallet,
  });

  const live = args.getLiveAccount();
  if (!live || live.toLowerCase() !== args.capturedWallet.toLowerCase()) {
    throw new HolderRewardClaimAccountChangedError();
  }
  assertRobinhoodChain(args.getLiveChainId());

  args.onPhase?.('awaiting_wallet');
  const txHash = await args.walletClient.writeContract({
    ...simulated.request,
    account: args.capturedWallet,
    chain: args.walletClient.chain,
  } as never);

  args.onPhase?.('submitted');
  args.onPhase?.('confirming');
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new HolderRewardClaimVerificationError('Claim transaction reverted');
  }

  const verified = verifyHolderRewardClaimedEvent({
    receipt,
    vault: entitlement.vault,
    roundId,
    asset: entitlement.asset,
    account,
    amount,
  });

  return {
    txHash,
    amountRaw: verified.amount,
    vault: entitlement.vault,
    roundId,
    asset: entitlement.asset,
    account,
  };
}
