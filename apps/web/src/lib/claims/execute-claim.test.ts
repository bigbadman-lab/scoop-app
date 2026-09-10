import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type TransactionReceipt,
  zeroAddress,
} from 'viem';
import { walletCreatorId } from '@/lib/launch/creator-id';
import { scoopCreatorRewardsAbi } from './creator-rewards-abi';
import {
  ClaimAccountChangedError,
  ClaimVerificationError,
  buildWalletClaimIdentity,
  executeWalletCreatorClaim,
  verifyEthClaimedEvent,
  verifyTokenClaimedEvent,
} from './execute-claim';
import { SCOOP_CREATOR_REWARDS_ADDRESS } from './read-claimable';
import type { ClaimAsset } from './types';

const WALLET_A = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C' as const;
const WALLET_B = '0x1111111111111111111111111111111111111111' as const;
const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const abi = scoopCreatorRewardsAbi;

function ethAsset(): ClaimAsset {
  return {
    kind: 'eth',
    assetAddress: zeroAddress,
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
  };
}

function tokenAsset(): ClaimAsset {
  return {
    kind: 'token',
    assetAddress: TOKEN,
    symbol: 'AMZN',
    name: 'AMZN',
    decimals: 18,
  };
}

function ethClaimedLog(args: {
  creatorId: Hex;
  wallet: Address;
  amount: bigint;
}) {
  const topics = encodeEventTopics({
    abi,
    eventName: 'ETHClaimed',
    args: {
      creatorId: args.creatorId,
      wallet: args.wallet,
    },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [args.amount]);
  return {
    address: SCOOP_CREATOR_REWARDS_ADDRESS,
    data,
    topics,
  };
}

function tokenClaimedLog(args: {
  creatorId: Hex;
  wallet: Address;
  token: Address;
  amount: bigint;
}) {
  const topics = encodeEventTopics({
    abi,
    eventName: 'TokenClaimed',
    args: {
      creatorId: args.creatorId,
      wallet: args.wallet,
      token: args.token,
    },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }], [args.amount]);
  return {
    address: SCOOP_CREATOR_REWARDS_ADDRESS,
    data,
    topics,
  };
}

function receipt(logs: TransactionReceipt['logs'], status: 'success' | 'reverted' = 'success') {
  return {
    status,
    logs,
  } as TransactionReceipt;
}

describe('buildWalletClaimIdentity', () => {
  it('uses canonical walletCreatorId and same wallet as candidate', () => {
    const id = buildWalletClaimIdentity(WALLET_A);
    expect(id.kind).toBe('wallet');
    expect(id.wallet).toBe(WALLET_A);
    expect(id.creatorId).toBe(walletCreatorId(WALLET_A));
  });
});

describe('verifyEthClaimedEvent', () => {
  const creatorId = walletCreatorId(WALLET_A);

  it('accepts matching ETHClaimed', () => {
    const out = verifyEthClaimedEvent({
      receipt: receipt([
        ethClaimedLog({ creatorId, wallet: WALLET_A, amount: 42n }) as never,
      ]),
      creatorId,
      recipient: WALLET_A,
    });
    expect(out.amount).toBe(42n);
  });

  it('rejects missing event', () => {
    expect(() =>
      verifyEthClaimedEvent({
        receipt: receipt([]),
        creatorId,
        recipient: WALLET_A,
      }),
    ).toThrow(ClaimVerificationError);
  });

  it('rejects wrong creatorId', () => {
    expect(() =>
      verifyEthClaimedEvent({
        receipt: receipt([
          ethClaimedLog({
            creatorId: walletCreatorId(WALLET_B),
            wallet: WALLET_A,
            amount: 1n,
          }) as never,
        ]),
        creatorId,
        recipient: WALLET_A,
      }),
    ).toThrow(/creatorId mismatch/);
  });

  it('rejects wrong recipient', () => {
    expect(() =>
      verifyEthClaimedEvent({
        receipt: receipt([
          ethClaimedLog({ creatorId, wallet: WALLET_B, amount: 1n }) as never,
        ]),
        creatorId,
        recipient: WALLET_A,
      }),
    ).toThrow(/recipient mismatch/);
  });
});

describe('verifyTokenClaimedEvent', () => {
  const creatorId = walletCreatorId(WALLET_A);

  it('accepts matching TokenClaimed', () => {
    const out = verifyTokenClaimedEvent({
      receipt: receipt([
        tokenClaimedLog({
          creatorId,
          wallet: WALLET_A,
          token: TOKEN,
          amount: 99n,
        }) as never,
      ]),
      creatorId,
      recipient: WALLET_A,
      token: TOKEN,
    });
    expect(out.amount).toBe(99n);
  });

  it('rejects wrong token', () => {
    expect(() =>
      verifyTokenClaimedEvent({
        receipt: receipt([
          tokenClaimedLog({
            creatorId,
            wallet: WALLET_A,
            token: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            amount: 1n,
          }) as never,
        ]),
        creatorId,
        recipient: WALLET_A,
        token: TOKEN,
      }),
    ).toThrow(/token mismatch/);
  });
});

describe('executeWalletCreatorClaim', () => {
  it('ETH simulation → write uses simulated request; success returns amount+hash', async () => {
    const creatorId = walletCreatorId(WALLET_A);
    const simulatedRequest = {
      address: SCOOP_CREATOR_REWARDS_ADDRESS,
      abi,
      functionName: 'claimETH',
      args: [creatorId, WALLET_A],
    };
    const phases: string[] = [];
    const writeContract = vi.fn(async () => '0xabc' as Hex);
    const publicClient = {
      readContract: vi.fn(async () => 10n),
      simulateContract: vi.fn(async () => ({ request: simulatedRequest })),
      waitForTransactionReceipt: vi.fn(async () =>
        receipt([
          ethClaimedLog({ creatorId, wallet: WALLET_A, amount: 10n }) as never,
        ]),
      ),
    };
    const walletClient = {
      writeContract,
      chain: { id: 4663 },
    };

    const result = await executeWalletCreatorClaim({
      publicClient: publicClient as never,
      walletClient: walletClient as never,
      capturedWallet: WALLET_A,
      getLiveAccount: () => WALLET_A,
      asset: ethAsset(),
      onPhase: (p) => phases.push(p),
    });

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'claimETH',
        args: [creatorId, WALLET_A],
        account: WALLET_A,
      }),
    );
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        ...simulatedRequest,
        account: WALLET_A,
      }),
    );
    expect(result.txHash).toBe('0xabc');
    expect(result.amountRaw).toBe(10n);
    expect(result.recipient).toBe(WALLET_A);
    expect(phases).toEqual([
      'simulating',
      'awaiting_wallet',
      'submitted',
      'confirming',
    ]);
  });

  it('token simulation success path', async () => {
    const creatorId = walletCreatorId(WALLET_A);
    const publicClient = {
      readContract: vi.fn(async () => 5n),
      simulateContract: vi.fn(async () => ({
        request: {
          functionName: 'claimToken',
          args: [creatorId, TOKEN, WALLET_A],
        },
      })),
      waitForTransactionReceipt: vi.fn(async () =>
        receipt([
          tokenClaimedLog({
            creatorId,
            wallet: WALLET_A,
            token: TOKEN,
            amount: 5n,
          }) as never,
        ]),
      ),
    };
    const result = await executeWalletCreatorClaim({
      publicClient: publicClient as never,
      walletClient: {
        writeContract: vi.fn(async () => '0xdef' as Hex),
        chain: { id: 4663 },
      } as never,
      capturedWallet: WALLET_A,
      getLiveAccount: () => WALLET_A,
      asset: tokenAsset(),
    });
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'claimToken',
        args: [creatorId, TOKEN, WALLET_A],
      }),
    );
    expect(result.amountRaw).toBe(5n);
  });

  it('aborts when wallet switches before write', async () => {
    const publicClient = {
      readContract: vi.fn(async () => 1n),
      simulateContract: vi.fn(async () => ({
        request: { functionName: 'claimETH' },
      })),
      waitForTransactionReceipt: vi.fn(),
    };
    const writeContract = vi.fn();
    await expect(
      executeWalletCreatorClaim({
        publicClient: publicClient as never,
        walletClient: { writeContract, chain: { id: 4663 } } as never,
        capturedWallet: WALLET_A,
        getLiveAccount: () => WALLET_B,
        asset: ethAsset(),
      }),
    ).rejects.toBeInstanceOf(ClaimAccountChangedError);
    expect(writeContract).not.toHaveBeenCalled();
  });

  it('rejects reverted receipt', async () => {
    const publicClient = {
      readContract: vi.fn(async () => 1n),
      simulateContract: vi.fn(async () => ({
        request: { functionName: 'claimETH' },
      })),
      waitForTransactionReceipt: vi.fn(async () => receipt([], 'reverted')),
    };
    await expect(
      executeWalletCreatorClaim({
        publicClient: publicClient as never,
        walletClient: {
          writeContract: vi.fn(async () => '0x1' as Hex),
          chain: { id: 4663 },
        } as never,
        capturedWallet: WALLET_A,
        getLiveAccount: () => WALLET_A,
        asset: ethAsset(),
      }),
    ).rejects.toThrow(/reverted/);
  });

  it('rejects when claimable is zero on-chain', async () => {
    await expect(
      executeWalletCreatorClaim({
        publicClient: {
          readContract: vi.fn(async () => 0n),
          simulateContract: vi.fn(),
        } as never,
        walletClient: { writeContract: vi.fn(), chain: { id: 4663 } } as never,
        capturedWallet: WALLET_A,
        getLiveAccount: () => WALLET_A,
        asset: ethAsset(),
      }),
    ).rejects.toThrow(/Nothing claimable/);
  });
});
