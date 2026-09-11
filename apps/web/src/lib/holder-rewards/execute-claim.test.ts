import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type TransactionReceipt,
  zeroAddress,
} from 'viem';
import {
  buildHolderRewardMerkleTree,
  holderRewardLeafHash,
} from '@scoop/shared';
import { scoopHolderRewardsAbi } from './abi';
import {
  HolderRewardClaimAccountChangedError,
  HolderRewardClaimChainError,
  HolderRewardClaimVerificationError,
  executeHolderRewardClaim,
  verifyHolderRewardClaimedEvent,
} from './execute-claim';
import type { HolderRewardEntitlementDto } from './types';

const VAULT = '0x5555555555555555555555555555555555555555' as Address;
const ALICE = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;
const abi = scoopHolderRewardsAbi;

function makeEntitlement(): HolderRewardEntitlementDto {
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
    chainId: 4663,
    vault: VAULT,
    tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address,
    roundId: '7',
    asset: zeroAddress,
    account: ALICE,
    entitlementRaw: amount.toString(),
    leafHash: leaf,
    proof: tree.getProof(ALICE) as Hex[],
    snapshotBlock: '100',
    workerRoundStatus: 'published',
    workerMerkleRoot: tree.root,
    publishedTxHash: null,
  };
}

function claimedLog(args: {
  roundId: bigint;
  asset: Address;
  account: Address;
  amount: bigint;
}) {
  const topics = encodeEventTopics({
    abi,
    eventName: 'HolderRewardClaimed',
    args: {
      roundId: args.roundId,
      asset: args.asset,
      account: args.account,
    },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [args.amount]);
  return {
    address: VAULT,
    data,
    topics,
  };
}

function receipt(logs: TransactionReceipt['logs'], status: 'success' | 'reverted' = 'success') {
  return { status, logs } as TransactionReceipt;
}

describe('verifyHolderRewardClaimedEvent', () => {
  it('accepts matching HolderRewardClaimed', () => {
    const amount = 3n * 10n ** 18n;
    const out = verifyHolderRewardClaimedEvent({
      receipt: receipt([
        claimedLog({
          roundId: 7n,
          asset: zeroAddress,
          account: ALICE,
          amount,
        }) as never,
      ]),
      vault: VAULT,
      roundId: 7n,
      asset: zeroAddress,
      account: ALICE,
      amount,
    });
    expect(out.amount).toBe(amount);
  });

  it('rejects missing event', () => {
    expect(() =>
      verifyHolderRewardClaimedEvent({
        receipt: receipt([]),
        vault: VAULT,
        roundId: 7n,
        asset: zeroAddress,
        account: ALICE,
        amount: 1n,
      }),
    ).toThrow(HolderRewardClaimVerificationError);
  });

  it('rejects amount mismatch', () => {
    expect(() =>
      verifyHolderRewardClaimedEvent({
        receipt: receipt([
          claimedLog({
            roundId: 7n,
            asset: zeroAddress,
            account: ALICE,
            amount: 1n,
          }) as never,
        ]),
        vault: VAULT,
        roundId: 7n,
        asset: zeroAddress,
        account: ALICE,
        amount: 2n,
      }),
    ).toThrow(/amount mismatch/);
  });
});

describe('executeHolderRewardClaim', () => {
  it('rejects account mismatch before write', async () => {
    const entitlement = makeEntitlement();
    await expect(
      executeHolderRewardClaim({
        publicClient: {} as never,
        walletClient: {} as never,
        entitlement,
        capturedWallet: BOB,
        getLiveAccount: () => BOB,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(/does not match entitlement account/);
  });

  it('rejects wrong chain before write', async () => {
    const entitlement = makeEntitlement();
    await expect(
      executeHolderRewardClaim({
        publicClient: {} as never,
        walletClient: {} as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => ALICE,
        getLiveChainId: () => 1,
      }),
    ).rejects.toThrow(HolderRewardClaimChainError);
  });

  it('rejects already paid', async () => {
    const entitlement = makeEntitlement();
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, 7n, true];
        }
        if (functionName === 'isPaid') return true;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    await expect(
      executeHolderRewardClaim({
        publicClient: publicClient as never,
        walletClient: {} as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => ALICE,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(/Already paid/);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('rejects unpublished round', async () => {
    const entitlement = makeEntitlement();
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, 0n, false];
        }
        if (functionName === 'isPaid') return false;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(),
    };
    await expect(
      executeHolderRewardClaim({
        publicClient: publicClient as never,
        walletClient: {} as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => ALICE,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(/not published/);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('rejects proof mismatch before simulate', async () => {
    const entitlement = makeEntitlement();
    entitlement.proof = [
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ] as Hex[];
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, 7n, true];
        }
        if (functionName === 'isPaid') return false;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(),
    };
    await expect(
      executeHolderRewardClaim({
        publicClient: publicClient as never,
        walletClient: {} as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => ALICE,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(/Merkle proof|root|leaf/i);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });

  it('simulates before write and verifies HolderRewardClaimed', async () => {
    const entitlement = makeEntitlement();
    const amount = BigInt(entitlement.entitlementRaw);
    const phases: string[] = [];
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, amount + 4n * 10n ** 18n, true];
        }
        if (functionName === 'isPaid') return false;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(async () => ({
        request: {
          address: VAULT,
          abi,
          functionName: 'claim',
          args: [
            7n,
            zeroAddress,
            ALICE,
            amount,
            entitlement.proof,
          ],
        },
      })),
      waitForTransactionReceipt: vi.fn(async () =>
        receipt([
          claimedLog({
            roundId: 7n,
            asset: zeroAddress,
            account: ALICE,
            amount,
          }) as never,
        ]),
      ),
    };
    const walletClient = {
      chain: { id: 4663 },
      writeContract: vi.fn(async () => '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    };

    const result = await executeHolderRewardClaim({
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      entitlement,
      capturedWallet: ALICE,
      getLiveAccount: () => ALICE,
      getLiveChainId: () => 4663,
      onPhase: (p) => phases.push(p),
    });

    expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
    expect(walletClient.writeContract).toHaveBeenCalledTimes(1);
    expect(result.amountRaw).toBe(amount);
    expect(phases).toEqual([
      'simulating',
      'awaiting_wallet',
      'submitted',
      'confirming',
    ]);
  });

  it('rejects account change after simulate', async () => {
    const entitlement = makeEntitlement();
    const amount = BigInt(entitlement.entitlementRaw);
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, amount, true];
        }
        if (functionName === 'isPaid') return false;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(async () => ({
        request: { address: VAULT },
      })),
      waitForTransactionReceipt: vi.fn(),
    };
    const walletClient = {
      chain: { id: 4663 },
      writeContract: vi.fn(),
    };

    await expect(
      executeHolderRewardClaim({
        publicClient: publicClient as never,
        walletClient: walletClient as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => BOB,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(HolderRewardClaimAccountChangedError);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it('does not treat success receipt without matching event as verified', async () => {
    const entitlement = makeEntitlement();
    const amount = BigInt(entitlement.entitlementRaw);
    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'round') {
          return [entitlement.workerMerkleRoot, amount, true];
        }
        if (functionName === 'isPaid') return false;
        throw new Error(`unexpected ${functionName}`);
      }),
      simulateContract: vi.fn(async () => ({
        request: { address: VAULT },
      })),
      waitForTransactionReceipt: vi.fn(async () => receipt([])),
    };
    const walletClient = {
      chain: { id: 4663 },
      writeContract: vi.fn(async () => '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'),
    };

    await expect(
      executeHolderRewardClaim({
        publicClient: publicClient as never,
        walletClient: walletClient as never,
        entitlement,
        capturedWallet: ALICE,
        getLiveAccount: () => ALICE,
        getLiveChainId: () => 4663,
      }),
    ).rejects.toThrow(/event missing/);
  });
});
