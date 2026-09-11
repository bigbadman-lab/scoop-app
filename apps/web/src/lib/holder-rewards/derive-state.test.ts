import { describe, expect, it } from 'vitest';
import { type Address, type Hex, zeroAddress } from 'viem';
import {
  buildHolderRewardMerkleTree,
  holderRewardLeafHash,
} from '@scoop/shared';
import {
  deriveHolderRewardUiState,
  verifyEntitlementProofAgainstRoot,
} from './derive-state';

const VAULT = '0x5555555555555555555555555555555555555555' as Address;
const ALICE = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;

function fixture() {
  const tree = buildHolderRewardMerkleTree({
    chainId: 4663,
    vault: VAULT,
    roundId: 7n,
    asset: zeroAddress,
    entitlements: [
      { account: ALICE, amount: 3n * 10n ** 18n },
      { account: BOB, amount: 4n * 10n ** 18n },
    ],
  });
  const amount = 3n * 10n ** 18n;
  const leaf = holderRewardLeafHash({
    chainId: 4663,
    vault: VAULT,
    roundId: 7n,
    asset: zeroAddress,
    account: ALICE,
    amount,
  });
  return {
    tree,
    amount,
    leaf,
    proof: tree.getProof(ALICE) as Hex[],
  };
}

describe('deriveHolderRewardUiState', () => {
  it('maps unpublished → pending', () => {
    expect(
      deriveHolderRewardUiState({
        isPaid: false,
        roundPublished: false,
        onChainRoot: null,
        proofCheck: null,
      }).state,
    ).toBe('pending');
  });

  it('maps isPaid → paid regardless of proof/DB', () => {
    expect(
      deriveHolderRewardUiState({
        isPaid: true,
        roundPublished: true,
        onChainRoot: '0x01' as Hex,
        proofCheck: { ok: false, reason: 'ignored' },
      }).state,
    ).toBe('paid');
  });

  it('maps published + unpaid + valid proof → claimable', () => {
    const { tree, amount, leaf, proof } = fixture();
    const proofCheck = verifyEntitlementProofAgainstRoot({
      chainId: 4663,
      vault: VAULT,
      roundId: 7n,
      asset: zeroAddress,
      account: ALICE,
      amount,
      proof,
      storedLeafHash: leaf,
      workerMerkleRoot: tree.root,
      onChainRoot: tree.root,
    });
    expect(proofCheck.ok).toBe(true);
    expect(
      deriveHolderRewardUiState({
        isPaid: false,
        roundPublished: true,
        onChainRoot: tree.root,
        proofCheck,
      }).state,
    ).toBe('claimable');
  });

  it('maps root mismatch → unavailable', () => {
    const { amount, leaf, proof, tree } = fixture();
    const proofCheck = verifyEntitlementProofAgainstRoot({
      chainId: 4663,
      vault: VAULT,
      roundId: 7n,
      asset: zeroAddress,
      account: ALICE,
      amount,
      proof,
      storedLeafHash: leaf,
      workerMerkleRoot: tree.root,
      onChainRoot:
        '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex,
    });
    expect(proofCheck.ok).toBe(false);
    expect(
      deriveHolderRewardUiState({
        isPaid: false,
        roundPublished: true,
        onChainRoot:
          '0x9999999999999999999999999999999999999999999999999999999999999999' as Hex,
        proofCheck,
      }).state,
    ).toBe('unavailable');
  });

  it('maps invalid proof → unavailable', () => {
    const { tree, amount, leaf } = fixture();
    const proofCheck = verifyEntitlementProofAgainstRoot({
      chainId: 4663,
      vault: VAULT,
      roundId: 7n,
      asset: zeroAddress,
      account: ALICE,
      amount,
      proof: [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ] as Hex[],
      storedLeafHash: leaf,
      workerMerkleRoot: tree.root,
      onChainRoot: tree.root,
    });
    expect(proofCheck.ok).toBe(false);
    expect(
      deriveHolderRewardUiState({
        isPaid: false,
        roundPublished: true,
        onChainRoot: tree.root,
        proofCheck,
      }).state,
    ).toBe('unavailable');
  });
});
