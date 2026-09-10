import {
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  zeroAddress,
} from 'viem';
import { scoopAbis } from '@scoop/contracts';
import {
  assertWritesAllowed,
  writeContractLocal,
  type WriteGate,
} from './clients.js';
import type { FeeKeeperDeploymentMode } from './config.js';
import type { DistributionAction } from './classify.js';
import { isBenignZeroBalanceMessage } from './errors.js';
import {
  economicsLogFields,
  receiptHasDistributionEvent,
  verifyDistributionReceipt,
  type DistributionVerificationSuccess,
} from './distribution-verify.js';

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
      verification: DistributionVerificationSuccess;
    }
  | {
      ok: false;
      error: string;
      txHash?: Hash;
      benignZero?: boolean;
      verificationFailed?: boolean;
    };

export async function writeDistribute(
  gate: WriteGate,
  publicClient: PublicClient,
  input: {
    feeDistributor: Address;
    action: DistributionAction;
    deploymentMode: FeeKeeperDeploymentMode;
    holderRewards: Address | null;
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
    const verification = verifyDistributionReceipt({
      receipt,
      feeDistributor: input.feeDistributor,
      action: input.action,
      deploymentMode: input.deploymentMode,
      holderRewards: input.holderRewards,
    });
    if (!verification.ok) {
      return {
        ok: false,
        error: verification.error,
        txHash,
        verificationFailed: true,
      };
    }
    return { ok: true, txHash, receipt, verification };
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

export function actionLabel(action: DistributionAction): string {
  return action.kind === 'eth' ? 'ETH' : action.token;
}

export { receiptHasDistributionEvent, economicsLogFields };
