import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  decodeEventLog,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import {
  assertWritesAllowed,
  writeContractLocal,
  type WriteGate,
} from './clients.js';

const lockerAbi = scoopAbis.ScoopLiquidityLocker;

export type CollectSimulateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function simulateCollectFees(
  publicClient: PublicClient,
  input: { locker: Address; lpTokenId: bigint; account?: Address },
): Promise<CollectSimulateResult> {
  try {
    await publicClient.simulateContract({
      address: input.locker,
      abi: lockerAbi,
      functionName: 'collectFees',
      args: [input.lpTokenId],
      account: input.account,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type CollectWriteResult =
  | {
      ok: true;
      txHash: Hash;
      receipt: TransactionReceipt;
      feesCollectedVerified: boolean;
    }
  | { ok: false; error: string; txHash?: Hash };

/**
 * Broadcast collectFees — WRITE GATE REQUIRED.
 * Success = receipt.status === 'success' (tx hash alone is insufficient).
 */
export async function writeCollectFees(
  gate: WriteGate,
  publicClient: PublicClient,
  input: { locker: Address; lpTokenId: bigint },
): Promise<CollectWriteResult> {
  assertWritesAllowed(gate);
  let txHash: Hash | undefined;
  try {
    const { request } = await publicClient.simulateContract({
      address: input.locker,
      abi: lockerAbi,
      functionName: 'collectFees',
      args: [input.lpTokenId],
      account: gate.account,
    });
    txHash = await writeContractLocal(gate, request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      return { ok: false, error: 'reverted_receipt', txHash };
    }
    const feesCollectedVerified = receiptHasFeesCollected(
      receipt,
      input.locker,
      input.lpTokenId,
    );
    return { ok: true, txHash, receipt, feesCollectedVerified };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      txHash,
    };
  }
}

export function receiptHasFeesCollected(
  receipt: TransactionReceipt,
  locker: Address,
  lpTokenId: bigint,
  expectedFeeDistributor?: Address,
): boolean {
  const lockerLower = locker.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== lockerLower) continue;
    try {
      const decoded = decodeEventLog({
        abi: lockerAbi,
        data: log.data,
        topics: log.topics,
      });
      if (decoded.eventName === 'FeesCollected') {
        const args = decoded.args as {
          tokenId?: bigint;
          feeDistributor_?: Address;
          feeDistributor?: Address;
        };
        if (args.tokenId !== undefined && args.tokenId !== lpTokenId) {
          continue;
        }
        // Prefer matching feeDistributor_ (on-chain indexed name) when present.
        const fd = args.feeDistributor_ ?? args.feeDistributor;
        if (
          expectedFeeDistributor &&
          fd &&
          fd.toLowerCase() !== expectedFeeDistributor.toLowerCase()
        ) {
          continue;
        }
        return true;
      }
    } catch {
      /* not this event */
    }
  }
  return false;
}
