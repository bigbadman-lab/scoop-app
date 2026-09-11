import type { Address, Hex } from 'viem';
import {
  holderRewardLeafHash,
  verifyMerkleProof,
} from '@scoop/shared';
import type { HolderRewardDurableState } from './types';

export type EntitlementProofCheckInput = {
  chainId: number;
  vault: Address;
  roundId: bigint;
  asset: Address;
  account: Address;
  amount: bigint;
  proof: Hex[];
  storedLeafHash: Hex;
  workerMerkleRoot: Hex | null;
  onChainRoot: Hex;
};

export type EntitlementProofCheckResult =
  | { ok: true; leaf: Hex }
  | { ok: false; reason: string };

/**
 * Validate stored proof against the on-chain published root.
 * Fail closed on any mismatch — never regenerate economics in the browser.
 */
export function verifyEntitlementProofAgainstRoot(
  input: EntitlementProofCheckInput,
): EntitlementProofCheckResult {
  if (input.amount <= BigInt(0)) {
    return { ok: false, reason: 'Entitlement amount must be positive' };
  }
  if (
    input.workerMerkleRoot != null &&
    input.workerMerkleRoot.toLowerCase() !== input.onChainRoot.toLowerCase()
  ) {
    return { ok: false, reason: 'Worker merkle root does not match on-chain root' };
  }

  let leaf: Hex;
  try {
    leaf = holderRewardLeafHash({
      chainId: input.chainId,
      vault: input.vault,
      roundId: input.roundId,
      asset: input.asset,
      account: input.account,
      amount: input.amount,
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not hash leaf',
    };
  }

  if (leaf.toLowerCase() !== input.storedLeafHash.toLowerCase()) {
    return { ok: false, reason: 'Stored leaf hash does not match derived leaf' };
  }

  if (!verifyMerkleProof(input.proof, input.onChainRoot, leaf)) {
    return { ok: false, reason: 'Merkle proof does not verify against on-chain root' };
  }

  return { ok: true, leaf };
}

export type DeriveHolderRewardUiStateInput = {
  isPaid: boolean;
  roundPublished: boolean;
  onChainRoot: Hex | null;
  readError?: string | null;
  proofCheck: EntitlementProofCheckResult | null;
};

/**
 * Map on-chain facts (+ optional proof check) to durable UI state.
 * DB worker status / push_status never override isPaid.
 */
export function deriveHolderRewardUiState(
  input: DeriveHolderRewardUiStateInput,
): { state: HolderRewardDurableState; reason: string | null } {
  if (input.readError) {
    return { state: 'error', reason: input.readError };
  }
  if (input.isPaid) {
    return { state: 'paid', reason: null };
  }
  if (!input.roundPublished || input.onChainRoot == null) {
    return { state: 'pending', reason: null };
  }
  if (input.proofCheck == null) {
    return { state: 'unavailable', reason: 'Proof not verified' };
  }
  if (!input.proofCheck.ok) {
    return { state: 'unavailable', reason: input.proofCheck.reason };
  }
  return { state: 'claimable', reason: null };
}
