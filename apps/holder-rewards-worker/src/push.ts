/**
 * Permissionless pushBatch settlement — separate from publisher authority.
 * Failed recipients remain claimable.
 */
import { type Address, type Hash, type Hex, type PublicClient } from 'viem';
import {
  assertPushAllowed,
  resolvePushWriteGate,
  writeContractLocal,
  type HolderRewardsClients,
  type PushWriteGate,
} from './clients.js';
import { holderRewardsAbi, readIsPaid } from './chain.js';
import { logJson } from './log.js';
import type { ComputedLeaf } from './compute.js';

export type PushBatchArgs = {
  clients: HolderRewardsClients;
  writeEnabled: boolean;
  vault: Address;
  roundId: number;
  asset: Address;
  leaves: ComputedLeaf[];
  batchSize: number;
  runId: string;
  /** Optional on-chain paid filter. */
  skipIfPaidOnChain?: boolean;
};

export type PushBatchResult = {
  ok: true;
  mode: 'simulated' | 'sent';
  batches: number;
  leavesAttempted: number;
  leavesPaid: number;
  leavesFailed: number;
  txHashes: Hash[];
};

export type PushBatchFailure = {
  ok: false;
  error: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function pushBatchesSafe(
  args: PushBatchArgs,
): Promise<PushBatchResult | PushBatchFailure> {
  const ordered = [...args.leaves].sort((a, b) =>
    a.account.toLowerCase().localeCompare(b.account.toLowerCase()),
  );

  let unpaid = ordered;
  if (args.skipIfPaidOnChain && args.writeEnabled) {
    const filtered: ComputedLeaf[] = [];
    for (const leaf of ordered) {
      const paid = await readIsPaid(
        args.clients.publicClient,
        args.vault,
        args.roundId,
        args.asset,
        leaf.account,
      );
      if (!paid) filtered.push(leaf);
    }
    unpaid = filtered;
  }

  const batches = chunk(unpaid, args.batchSize);
  const txHashes: Hash[] = [];
  let leavesPaid = 0;
  let leavesFailed = 0;

  if (batches.length === 0) {
    return {
      ok: true,
      mode: args.writeEnabled ? 'sent' : 'simulated',
      batches: 0,
      leavesAttempted: 0,
      leavesPaid: 0,
      leavesFailed: 0,
      txHashes: [],
    };
  }

  for (let batchNumber = 0; batchNumber < batches.length; batchNumber++) {
    const batch = batches[batchNumber]!;
    const payouts = batch.map((leaf) => ({
      account: leaf.account,
      amount: leaf.entitlementRaw,
      proof: leaf.proof,
    }));

    let simulationRequest: object;
    try {
      const sim = await args.clients.publicClient.simulateContract({
        address: args.vault,
        abi: holderRewardsAbi,
        functionName: 'pushBatch',
        args: [BigInt(args.roundId), args.asset, payouts],
        account: args.clients.pushAddress ?? undefined,
      });
      simulationRequest = sim.request;
    } catch (error) {
      // Offline fixture / no live vault: fall through to simulated accounting
      if (!args.writeEnabled) {
        logJson('info', 'push_batch_simulated', {
          runId: args.runId,
          vault: args.vault,
          roundId: args.roundId,
          asset: args.asset,
          batchNumber,
          leafCount: batch.length,
          note: 'simulation skipped (offline/fixture)',
          error: error instanceof Error ? error.message : String(error),
        });
        leavesPaid += batch.length;
        continue;
      }
      return {
        ok: false,
        error: `pushBatch simulation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    logJson('info', 'push_batch_simulated', {
      runId: args.runId,
      vault: args.vault,
      roundId: args.roundId,
      asset: args.asset,
      batchNumber,
      leafCount: batch.length,
    });

    if (!args.writeEnabled) {
      leavesPaid += batch.length;
      continue;
    }

    const gate: PushWriteGate = resolvePushWriteGate(args.clients);
    try {
      assertPushAllowed(gate);
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
        error: `pushBatch broadcast failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    txHashes.push(txHash);

    const receipt = await args.clients.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    if (receipt.status !== 'success') {
      return { ok: false, error: `pushBatch tx reverted: ${txHash}` };
    }

    // Best-effort: contract emits per-recipient success/fail; count via isPaid.
    for (const leaf of batch) {
      const paid = await readIsPaid(
        args.clients.publicClient,
        args.vault,
        args.roundId,
        args.asset,
        leaf.account,
      );
      if (paid) leavesPaid += 1;
      else leavesFailed += 1;
    }

    logJson('info', 'push_batch_verified', {
      runId: args.runId,
      vault: args.vault,
      roundId: args.roundId,
      asset: args.asset,
      batchNumber,
      txHash,
      leafCount: batch.length,
    });
  }

  return {
    ok: true,
    mode: args.writeEnabled ? 'sent' : 'simulated',
    batches: batches.length,
    leavesAttempted: unpaid.length,
    leavesPaid,
    leavesFailed,
    txHashes,
  };
}

/** Pure offline batching helper for fixtures (no RPC). */
export function planPushBatches(
  leaves: ComputedLeaf[],
  batchSize: number,
): ComputedLeaf[][] {
  const ordered = [...leaves].sort((a, b) =>
    a.account.toLowerCase().localeCompare(b.account.toLowerCase()),
  );
  return chunk(ordered, batchSize);
}
