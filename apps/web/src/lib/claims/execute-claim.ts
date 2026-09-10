import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  decodeEventLog,
  type TransactionReceipt,
} from 'viem';
import { walletCreatorId } from '@/lib/launch/creator-id';
import { scoopCreatorRewardsAbi } from './creator-rewards-abi';
import {
  SCOOP_CREATOR_REWARDS_ADDRESS,
  readClaimableEth,
  readClaimableToken,
} from './read-claimable';
import type { ClaimAsset, ClaimSuccess } from './types';

const creatorRewardsAbi = scoopCreatorRewardsAbi;

export class ClaimAccountChangedError extends Error {
  constructor(message = 'Wallet changed before claim. Retry.') {
    super(message);
    this.name = 'ClaimAccountChangedError';
  }
}

export class ClaimVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClaimVerificationError';
  }
}

export function buildWalletClaimIdentity(wallet: Address) {
  return {
    kind: 'wallet' as const,
    wallet,
    creatorId: walletCreatorId(wallet),
  };
}

export function verifyEthClaimedEvent(args: {
  receipt: TransactionReceipt;
  creatorId: Hex;
  recipient: Address;
}): { amount: bigint } {
  const rewards = SCOOP_CREATOR_REWARDS_ADDRESS.toLowerCase();
  for (const log of args.receipt.logs) {
    if (log.address.toLowerCase() !== rewards) continue;
    try {
      const decoded = decodeEventLog({
        abi: creatorRewardsAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'ETHClaimed') continue;
      const ev = decoded.args as {
        creatorId?: Hex;
        wallet?: Address;
        amount?: bigint;
      };
      if (!ev.creatorId || !ev.wallet || ev.amount === undefined) continue;
      if (ev.creatorId.toLowerCase() !== args.creatorId.toLowerCase()) {
        throw new ClaimVerificationError('ETHClaimed creatorId mismatch');
      }
      if (ev.wallet.toLowerCase() !== args.recipient.toLowerCase()) {
        throw new ClaimVerificationError('ETHClaimed recipient mismatch');
      }
      if (ev.amount <= BigInt(0)) {
        throw new ClaimVerificationError('ETHClaimed amount must be > 0');
      }
      return { amount: ev.amount };
    } catch (error) {
      if (error instanceof ClaimVerificationError) throw error;
    }
  }
  throw new ClaimVerificationError('ETHClaimed event missing');
}

export function verifyTokenClaimedEvent(args: {
  receipt: TransactionReceipt;
  creatorId: Hex;
  recipient: Address;
  token: Address;
}): { amount: bigint } {
  const rewards = SCOOP_CREATOR_REWARDS_ADDRESS.toLowerCase();
  for (const log of args.receipt.logs) {
    if (log.address.toLowerCase() !== rewards) continue;
    try {
      const decoded = decodeEventLog({
        abi: creatorRewardsAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== 'TokenClaimed') continue;
      const ev = decoded.args as {
        creatorId?: Hex;
        wallet?: Address;
        token?: Address;
        amount?: bigint;
      };
      if (!ev.creatorId || !ev.wallet || !ev.token || ev.amount === undefined) continue;
      if (ev.creatorId.toLowerCase() !== args.creatorId.toLowerCase()) {
        throw new ClaimVerificationError('TokenClaimed creatorId mismatch');
      }
      if (ev.wallet.toLowerCase() !== args.recipient.toLowerCase()) {
        throw new ClaimVerificationError('TokenClaimed recipient mismatch');
      }
      if (ev.token.toLowerCase() !== args.token.toLowerCase()) {
        throw new ClaimVerificationError('TokenClaimed token mismatch');
      }
      if (ev.amount <= BigInt(0)) {
        throw new ClaimVerificationError('TokenClaimed amount must be > 0');
      }
      return { amount: ev.amount };
    } catch (error) {
      if (error instanceof ClaimVerificationError) throw error;
    }
  }
  throw new ClaimVerificationError('TokenClaimed event missing');
}

export async function executeWalletCreatorClaim(args: {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  /** Captured at Claim click. */
  capturedWallet: Address;
  /** Live account immediately before write. */
  getLiveAccount: () => Address | undefined;
  asset: ClaimAsset;
  onPhase?: (phase: 'simulating' | 'awaiting_wallet' | 'submitted' | 'confirming') => void;
}): Promise<ClaimSuccess> {
  const identity = buildWalletClaimIdentity(args.capturedWallet);
  const candidateWallet = identity.wallet;
  const creatorId = identity.creatorId;

  args.onPhase?.('simulating');

  let claimable: bigint;
  if (args.asset.kind === 'eth') {
    claimable = await readClaimableEth({
      publicClient: args.publicClient,
      creatorId,
    });
  } else {
    claimable = await readClaimableToken({
      publicClient: args.publicClient,
      creatorId,
      token: args.asset.assetAddress,
    });
  }
  if (claimable <= BigInt(0)) {
    throw new ClaimVerificationError('Nothing claimable on-chain');
  }

  const simulated =
    args.asset.kind === 'eth'
      ? await args.publicClient.simulateContract({
          address: SCOOP_CREATOR_REWARDS_ADDRESS,
          abi: creatorRewardsAbi,
          functionName: 'claimETH',
          args: [creatorId, candidateWallet],
          account: candidateWallet,
        })
      : await args.publicClient.simulateContract({
          address: SCOOP_CREATOR_REWARDS_ADDRESS,
          abi: creatorRewardsAbi,
          functionName: 'claimToken',
          args: [creatorId, args.asset.assetAddress, candidateWallet],
          account: candidateWallet,
        });

  const live = args.getLiveAccount();
  if (!live || live.toLowerCase() !== args.capturedWallet.toLowerCase()) {
    throw new ClaimAccountChangedError();
  }

  args.onPhase?.('awaiting_wallet');
  const txHash = await args.walletClient.writeContract({
    ...simulated.request,
    account: candidateWallet,
    chain: args.walletClient.chain,
  } as never);

  args.onPhase?.('submitted');
  args.onPhase?.('confirming');
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    throw new ClaimVerificationError('Claim transaction reverted');
  }

  const verified =
    args.asset.kind === 'eth'
      ? verifyEthClaimedEvent({
          receipt,
          creatorId,
          recipient: candidateWallet,
        })
      : verifyTokenClaimedEvent({
          receipt,
          creatorId,
          recipient: candidateWallet,
          token: args.asset.assetAddress,
        });

  return {
    txHash,
    amountRaw: verified.amount,
    creatorId,
    recipient: candidateWallet,
    asset: args.asset,
  };
}
