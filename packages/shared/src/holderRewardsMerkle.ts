/**
 * OpenZeppelin-compatible commutative Merkle tree for ScoopHolderRewards.
 * Leaf matches ScoopHolderRewards.leafHash / ScoopHolderRewardsMerkle.sol:
 *   keccak256(bytes.concat(keccak256(abi.encode(chainId, vault, roundId, asset, account, amount))))
 * Node = commutativeKeccak256 (sorted pair hash).
 */
import {
  type Address,
  type Hex,
  concat,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
} from 'viem';

const leafAbi = parseAbiParameters(
  'uint256 chainId, address vault, uint64 roundId, address asset, address account, uint256 amount',
);

export function commutativeKeccak256(a: Hex, b: Hex): Hex {
  const al = a.toLowerCase() as Hex;
  const bl = b.toLowerCase() as Hex;
  return al <= bl ? keccak256(concat([al, bl])) : keccak256(concat([bl, al]));
}

export type HolderRewardLeafInput = {
  chainId: number;
  vault: Address;
  roundId: bigint;
  asset: Address;
  account: Address;
  amount: bigint;
};

/** Double-hashed leaf matching on-chain leafHash. */
export function holderRewardLeafHash(input: HolderRewardLeafInput): Hex {
  if (input.amount <= 0n) {
    throw new Error('holder reward leaf amount must be positive');
  }
  if (!Number.isInteger(input.chainId) || input.chainId <= 0) {
    throw new Error(`invalid chainId: ${input.chainId}`);
  }
  const inner = keccak256(
    encodeAbiParameters(leafAbi, [
      BigInt(input.chainId),
      input.vault,
      input.roundId,
      input.asset,
      input.account,
      input.amount,
    ]),
  );
  return keccak256(concat([inner]));
}

export type HolderRewardMerkleTree = {
  leaves: Hex[];
  root: Hex;
  /** Parallel to leaves — account lowercase. */
  accounts: string[];
  amounts: bigint[];
  getProof(account: string): Hex[];
  verify(account: string, amount: bigint, proof: Hex[]): boolean;
};

/**
 * Build tree from entitlements. Leaves are ordered by account ascending
 * (deterministic) — same order used for proofs.
 */
export function buildHolderRewardMerkleTree(args: {
  chainId: number;
  vault: Address;
  roundId: bigint;
  asset: Address;
  entitlements: Array<{ account: Address; amount: bigint }>;
}): HolderRewardMerkleTree {
  if (args.entitlements.length === 0) {
    throw new Error('cannot build merkle tree with zero entitlements');
  }
  const sorted = [...args.entitlements].sort((a, b) =>
    a.account.toLowerCase().localeCompare(b.account.toLowerCase()),
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.account.toLowerCase() === sorted[i - 1]!.account.toLowerCase()) {
      throw new Error(`duplicate entitlement account: ${sorted[i]!.account}`);
    }
  }

  const accounts = sorted.map((e) => e.account.toLowerCase());
  const amounts = sorted.map((e) => e.amount);
  const leaves = sorted.map((e) =>
    holderRewardLeafHash({
      chainId: args.chainId,
      vault: args.vault,
      roundId: args.roundId,
      asset: args.asset,
      account: e.account,
      amount: e.amount,
    }),
  );
  const root = merkleRootFromLeaves(leaves);
  const allProofs = merkleProofsFromLeaves(leaves);

  return {
    leaves,
    root,
    accounts,
    amounts,
    getProof(account: string): Hex[] {
      const idx = accounts.indexOf(account.toLowerCase());
      if (idx < 0) throw new Error(`account not in tree: ${account}`);
      return allProofs[idx]!;
    },
    verify(account: string, amount: bigint, proof: Hex[]): boolean {
      const leaf = holderRewardLeafHash({
        chainId: args.chainId,
        vault: args.vault,
        roundId: args.roundId,
        asset: args.asset,
        account: account as Address,
        amount,
      });
      return verifyMerkleProof(proof, root, leaf);
    },
  };
}

export function merkleRootFromLeaves(leaves: Hex[]): Hex {
  if (leaves.length === 0) throw new Error('empty leaves');
  let layer = [...leaves];
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(commutativeKeccak256(layer[i]!, layer[i + 1]!));
      } else {
        next.push(layer[i]!);
      }
    }
    layer = next;
  }
  return layer[0]!;
}

/** O(n log n) proofs for every leaf (avoids rebuilding the tree per index). */
export function merkleProofsFromLeaves(leaves: Hex[]): Hex[][] {
  if (leaves.length === 0) return [];
  const proofs: Hex[][] = Array.from({ length: leaves.length }, () => []);
  let layer = [...leaves];
  /** Current layer index for each original leaf. */
  const positions = leaves.map((_, i) => i);

  while (layer.length > 1) {
    const n = layer.length;
    for (let oi = 0; oi < leaves.length; oi++) {
      const idx = positions[oi]!;
      const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sibling < n) {
        proofs[oi]!.push(layer[sibling]!);
      }
      positions[oi] = Math.floor(idx / 2);
    }
    const next: Hex[] = [];
    for (let i = 0; i < n; i += 2) {
      if (i + 1 < n) {
        next.push(commutativeKeccak256(layer[i]!, layer[i + 1]!));
      } else {
        next.push(layer[i]!);
      }
    }
    layer = next;
  }
  return proofs;
}

export function merkleProofFromLeaves(leaves: Hex[], index: number): Hex[] {
  if (index < 0 || index >= leaves.length) throw new Error('proof index out of range');
  return merkleProofsFromLeaves(leaves)[index]!;
}

export function verifyMerkleProof(proof: Hex[], root: Hex, leaf: Hex): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = commutativeKeccak256(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}
