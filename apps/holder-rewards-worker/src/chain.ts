/**
 * On-chain ScoopHolderRewards reads / validation (publisher authority separate from push).
 */
import { scoopAbis } from '@scoop/contracts';
import {
  type Address,
  type Hex,
  type PublicClient,
  decodeEventLog,
  zeroAddress,
} from 'viem';

const holderRewardsAbi = scoopAbis.ScoopHolderRewards;

export async function readVaultRootPublisher(
  publicClient: PublicClient,
  vault: Address,
): Promise<Address> {
  const publisher = (await publicClient.readContract({
    address: vault,
    abi: holderRewardsAbi,
    functionName: 'rootPublisher',
  })) as Address;
  return publisher.toLowerCase() as Address;
}

export async function readUncommitted(
  publicClient: PublicClient,
  vault: Address,
  asset: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: vault,
    abi: holderRewardsAbi,
    functionName: 'uncommitted',
    args: [asset],
  }) as Promise<bigint>;
}

export async function readRound(
  publicClient: PublicClient,
  vault: Address,
  roundId: number,
  asset: Address,
): Promise<{ merkleRoot: Hex; totalCommitted: bigint; published: boolean }> {
  const [merkleRoot, totalCommitted, published] = (await publicClient.readContract(
    {
      address: vault,
      abi: holderRewardsAbi,
      functionName: 'round',
      args: [BigInt(roundId), asset],
    },
  )) as [Hex, bigint, boolean];
  return {
    merkleRoot: merkleRoot.toLowerCase() as Hex,
    totalCommitted,
    published,
  };
}

export async function readIsPaid(
  publicClient: PublicClient,
  vault: Address,
  roundId: number,
  asset: Address,
  account: Address,
): Promise<boolean> {
  return publicClient.readContract({
    address: vault,
    abi: holderRewardsAbi,
    functionName: 'isPaid',
    args: [BigInt(roundId), asset, account],
  }) as Promise<boolean>;
}

export async function assertPublisherMatchesVault(args: {
  publicClient: PublicClient;
  vault: Address;
  expectedPublisher: Address;
}): Promise<void> {
  const onChain = await readVaultRootPublisher(args.publicClient, args.vault);
  if (onChain !== args.expectedPublisher.toLowerCase()) {
    throw new Error(
      `FATAL: vault rootPublisher ${onChain} !== configured publisher ${args.expectedPublisher}`,
    );
  }
}

export function decodeRoundPublished(args: {
  logs: Array<{ address: Address; data: Hex; topics: [Hex, ...Hex[]] | [] }>;
  vault: Address;
  roundId: number;
  asset: Address;
  expectedRoot: Hex;
  expectedAmount: bigint;
}): {
  ok: true;
  root: Hex;
  totalCommitted: bigint;
} | { ok: false; error: string } {
  for (const log of args.logs) {
    if (log.address.toLowerCase() !== args.vault.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: holderRewardsAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== 'HolderRewardRoundPublished') continue;
      const argsDecoded = decoded.args as unknown as {
        roundId: bigint;
        asset: Address;
        merkleRoot: Hex;
        totalCommitted: bigint;
      };
      if (Number(argsDecoded.roundId) !== args.roundId) continue;
      if (argsDecoded.asset.toLowerCase() !== args.asset.toLowerCase()) continue;
      const root = argsDecoded.merkleRoot.toLowerCase() as Hex;
      if (root !== args.expectedRoot.toLowerCase()) {
        return { ok: false, error: 'RoundPublished root mismatch' };
      }
      if (argsDecoded.totalCommitted !== args.expectedAmount) {
        return { ok: false, error: 'RoundPublished amount mismatch' };
      }
      return { ok: true, root, totalCommitted: argsDecoded.totalCommitted };
    } catch {
      /* not our event */
    }
  }
  return { ok: false, error: 'missing HolderRewardRoundPublished' };
}

export { holderRewardsAbi, zeroAddress };
