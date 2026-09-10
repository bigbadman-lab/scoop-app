/**
 * publishRound simulation + gated broadcast.
 * Publisher role only — never fee-keeper key.
 */
import { type Address, type Hash, type Hex, type PublicClient } from 'viem';
import {
  assertPublishAllowed,
  resolvePublishWriteGate,
  writeContractLocal,
  type HolderRewardsClients,
  type PublishWriteGate,
} from './clients.js';
import {
  assertPublisherMatchesVault,
  decodeRoundPublished,
  holderRewardsAbi,
  readRound,
  readUncommitted,
} from './chain.js';
import { logJson } from './log.js';

export type PublishRoundArgs = {
  clients: HolderRewardsClients;
  writeEnabled: boolean;
  vault: Address;
  roundId: number;
  asset: Address;
  merkleRoot: Hex;
  totalCommitted: bigint;
  expectedPublisher: Address | null;
  runId: string;
};

export type PublishRoundResult =
  | {
      ok: true;
      mode: 'simulated' | 'published';
      txHash: Hash | null;
      merkleRoot: Hex;
      totalCommitted: bigint;
    }
  | { ok: false; error: string; fatal?: boolean };

export async function publishRoundSafe(
  args: PublishRoundArgs,
): Promise<PublishRoundResult> {
  const { clients, vault, roundId, asset, merkleRoot, totalCommitted } = args;
  const publicClient = clients.publicClient;

  if (totalCommitted <= 0n) {
    return { ok: false, error: 'totalCommitted must be positive' };
  }
  if (!merkleRoot || /^0x0+$/i.test(merkleRoot)) {
    return { ok: false, error: 'merkleRoot must be non-zero' };
  }

  let sumCheckUncommitted: bigint;
  try {
    sumCheckUncommitted = await readUncommitted(publicClient, vault, asset);
  } catch (error) {
    return {
      ok: false,
      error: `uncommitted read failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (totalCommitted > sumCheckUncommitted) {
    return {
      ok: false,
      error: `insufficient uncommitted: need ${totalCommitted} have ${sumCheckUncommitted}`,
    };
  }

  const existing = await readRound(publicClient, vault, roundId, asset);
  if (existing.published) {
    if (
      existing.merkleRoot === merkleRoot.toLowerCase() &&
      existing.totalCommitted === totalCommitted
    ) {
      logJson('info', 'round_already_published', {
        runId: args.runId,
        vault,
        roundId,
        asset,
        merkleRoot,
      });
      return {
        ok: true,
        mode: 'published',
        txHash: null,
        merkleRoot,
        totalCommitted,
      };
    }
    return {
      ok: false,
      fatal: true,
      error: `FATAL: on-chain round already published with different root/amount`,
    };
  }

  if (args.expectedPublisher) {
    try {
      await assertPublisherMatchesVault({
        publicClient,
        vault,
        expectedPublisher: args.expectedPublisher,
      });
    } catch (error) {
      return {
        ok: false,
        fatal: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let simulationRequest: object;
  try {
    const sim = await publicClient.simulateContract({
      address: vault,
      abi: holderRewardsAbi,
      functionName: 'publishRound',
      args: [BigInt(roundId), asset, merkleRoot, totalCommitted],
      account: args.expectedPublisher ?? undefined,
    });
    simulationRequest = sim.request;
  } catch (error) {
    return {
      ok: false,
      error: `publishRound simulation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  logJson('info', 'publish_simulated', {
    runId: args.runId,
    vault,
    roundId,
    asset,
    merkleRoot,
    rewardAmountRaw: totalCommitted.toString(),
  });

  if (!args.writeEnabled) {
    return {
      ok: true,
      mode: 'simulated',
      txHash: null,
      merkleRoot,
      totalCommitted,
    };
  }

  const gate: PublishWriteGate = resolvePublishWriteGate(clients);
  try {
    assertPublishAllowed(gate);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let txHash: Hash;
  try {
    txHash = await writeContractLocal(gate, simulationRequest);
  } catch (error) {
    return {
      ok: false,
      error: `publishRound broadcast failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (receipt.status !== 'success') {
    return { ok: false, error: `publishRound tx reverted: ${txHash}` };
  }

  const decoded = decodeRoundPublished({
    logs: receipt.logs as Array<{
      address: Address;
      data: Hex;
      topics: [Hex, ...Hex[]] | [];
    }>,
    vault,
    roundId,
    asset,
    expectedRoot: merkleRoot,
    expectedAmount: totalCommitted,
  });
  if (!decoded.ok) {
    return { ok: false, fatal: true, error: decoded.error };
  }

  const onChain = await readRound(publicClient, vault, roundId, asset);
  if (
    !onChain.published ||
    onChain.merkleRoot !== merkleRoot.toLowerCase() ||
    onChain.totalCommitted !== totalCommitted
  ) {
    return {
      ok: false,
      fatal: true,
      error: 'post-publish on-chain round state mismatch',
    };
  }

  logJson('info', 'round_published', {
    runId: args.runId,
    vault,
    roundId,
    asset,
    merkleRoot,
    txHash,
    rewardAmountRaw: totalCommitted.toString(),
  });

  return {
    ok: true,
    mode: 'published',
    txHash,
    merkleRoot,
    totalCommitted,
  };
}

/** Dry-run helper when no RPC vault is available (fixture). */
export function simulatePublishOffline(args: {
  merkleRoot: Hex;
  totalCommitted: bigint;
}): PublishRoundResult {
  if (args.totalCommitted <= 0n) {
    return { ok: false, error: 'totalCommitted must be positive' };
  }
  return {
    ok: true,
    mode: 'simulated',
    txHash: null,
    merkleRoot: args.merkleRoot,
    totalCommitted: args.totalCommitted,
  };
}
