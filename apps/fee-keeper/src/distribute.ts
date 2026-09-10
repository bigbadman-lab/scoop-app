import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  decodeEventLog,
  zeroAddress,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import {
  assertWritesAllowed,
  writeContractLocal,
  type WriteGate,
} from './clients.js';
import type { DistributionAction } from './classify.js';
import { isBenignZeroBalanceMessage } from './errors.js';

const distributorAbi = scoopAbis.ScoopFeeDistributor;

export type DistributeSimulateResult =
  | { ok: true }
  | { ok: false; error: string; benignZero?: boolean };

function assertNotZeroToken(action: DistributionAction): void {
  if (
    action.kind === 'token' &&
    action.token.toLowerCase() === zeroAddress
  ) {
    throw new Error('distributeToken(address(0)) is forbidden');
  }
}

export async function simulateDistribute(
  publicClient: PublicClient,
  input: {
    feeDistributor: Address;
    action: DistributionAction;
    account?: Address;
  },
): Promise<DistributeSimulateResult> {
  try {
    assertNotZeroToken(input.action);
    if (input.action.kind === 'eth') {
      await publicClient.simulateContract({
        address: input.feeDistributor,
        abi: distributorAbi,
        functionName: 'distributeETH',
        account: input.account,
      });
    } else {
      await publicClient.simulateContract({
        address: input.feeDistributor,
        abi: distributorAbi,
        functionName: 'distributeToken',
        args: [input.action.token],
        account: input.account,
      });
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      benignZero: isBenignZeroBalanceMessage(message),
    };
  }
}

export type DistributeWriteResult =
  | {
      ok: true;
      txHash: Hash;
      receipt: TransactionReceipt;
      eventVerified: boolean;
    }
  | { ok: false; error: string; txHash?: Hash; benignZero?: boolean };

export async function writeDistribute(
  gate: WriteGate,
  publicClient: PublicClient,
  input: {
    feeDistributor: Address;
    action: DistributionAction;
  },
): Promise<DistributeWriteResult> {
  assertWritesAllowed(gate);
  let txHash: Hash | undefined;
  try {
    assertNotZeroToken(input.action);
    const simulated =
      input.action.kind === 'eth'
        ? await publicClient.simulateContract({
            address: input.feeDistributor,
            abi: distributorAbi,
            functionName: 'distributeETH',
            account: gate.account,
          })
        : await publicClient.simulateContract({
            address: input.feeDistributor,
            abi: distributorAbi,
            functionName: 'distributeToken',
            args: [input.action.token],
            account: gate.account,
          });

    txHash = await writeContractLocal(gate, simulated.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== 'success') {
      return { ok: false, error: 'reverted_receipt', txHash };
    }
    const eventVerified = receiptHasDistributionEvent(
      receipt,
      input.feeDistributor,
      input.action,
    );
    return { ok: true, txHash, receipt, eventVerified };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      txHash,
      benignZero: isBenignZeroBalanceMessage(message),
    };
  }
}

export function receiptHasDistributionEvent(
  receipt: TransactionReceipt,
  feeDistributor: Address,
  action: DistributionAction,
): boolean {
  const addr = feeDistributor.toLowerCase();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== addr) continue;
    try {
      const decoded = decodeEventLog({
        abi: distributorAbi,
        data: log.data,
        topics: log.topics,
      });
      if (action.kind === 'eth' && decoded.eventName === 'ETHDistributed') {
        return true;
      }
      if (action.kind === 'token' && decoded.eventName === 'TokenDistributed') {
        const token = (decoded.args as { token?: Address }).token;
        if (!token) return true;
        return token.toLowerCase() === action.token.toLowerCase();
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function actionLabel(action: DistributionAction): string {
  return action.kind === 'eth' ? 'ETH' : action.token;
}
