import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, type TransactionReceipt } from 'viem';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from '@/lib/launch/adapters/pons/pending-storage';
import {
  bigintToDecimal,
  emptyHoodlockFields,
  type PonsPendingLaunchState,
} from '@/lib/launch/adapters/pons/lifecycle-types';
import {
  FIXTURE_CREATOR,
  FIXTURE_CURVE,
  FIXTURE_TOKEN,
  FIXTURE_TOKENS_OUT,
} from '@/lib/launch/adapters/pons/__fixtures__/receipts';
import { DEV_SUPPLY_BURN_ADDRESS } from '@/lib/launch/dev-supply-policy';
import {
  broadcastBurnDevSupply,
  recoverBurnFromPending,
  verifyBurnTransferReceipt,
} from '@/lib/launch/burn-orchestrate';

const draftId = 'burn-1';
const salt =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
const burnHash =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const ponsHash =
  '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f' as const;

function transferLog(amount: bigint) {
  const abi = [
    {
      type: 'event' as const,
      name: 'Transfer',
      inputs: [
        { name: 'from', type: 'address', indexed: true },
        { name: 'to', type: 'address', indexed: true },
        { name: 'value', type: 'uint256', indexed: false },
      ],
    },
  ];
  return {
    address: FIXTURE_TOKEN,
    topics: encodeEventTopics({
      abi,
      eventName: 'Transfer',
      args: { from: FIXTURE_CREATOR, to: DEV_SUPPLY_BURN_ADDRESS },
    }),
    data: encodeAbiParameters([{ type: 'uint256', name: 'value' }], [amount]),
  };
}

function receipt(status: 'success' | 'reverted', amount = FIXTURE_TOKENS_OUT): TransactionReceipt {
  return {
    status,
    logs: status === 'success' ? [transferLog(amount)] : [],
  } as unknown as TransactionReceipt;
}

function burnState(over?: Partial<PonsPendingLaunchState>): PonsPendingLaunchState {
  const t = Date.now();
  return {
    version: 1,
    draftId,
    phase: 'lock_required',
    creator: FIXTURE_CREATOR,
    chainId: 4663,
    salt,
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: '45000000000000000',
    slippageBps: 100,
    creatorTaxBps: 0,
    buybackEnabled: true,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://x',
    description: 'd',
    twitter: '',
    telegram: '',
    website: '',
    discord: '',
    farcaster: '',
    expectedEconomics: null,
    launchFeeWei: null,
    requiredMsgValueWei: null,
    simulatedTokenAddress: null,
    simulatedCurveAddress: null,
    simulatedTokensOut: null,
    minTokensOut: null,
    ponsTxHash: ponsHash,
    tokenAddress: FIXTURE_TOKEN,
    curveAddress: FIXTURE_CURVE,
    devTokensOut: bigintToDecimal(FIXTURE_TOKENS_OUT),
    actualQuoteIn: '45000000000000000',
    refundWei: '0',
    receiptBlockNumber: '1',
    lastError: null,
    ...emptyHoodlockFields(),
    devSupplyPolicy: 'burn',
    burnTxHash: null,
    burnVerified: null,
    burnVerifiedAt: null,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

describe('dev supply burn', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch(draftId);
  });

  it('accepts only an exact Transfer of devTokensOut to the canonical burn address', () => {
    verifyBurnTransferReceipt({
      receipt: receipt('success'),
      token: FIXTURE_TOKEN,
      from: FIXTURE_CREATOR,
      amount: FIXTURE_TOKENS_OUT,
    });
    expect(() =>
      verifyBurnTransferReceipt({
        receipt: receipt('success', FIXTURE_TOKENS_OUT - BigInt(1)),
        token: FIXTURE_TOKEN,
        from: FIXTURE_CREATOR,
        amount: FIXTURE_TOKENS_OUT,
      }),
    ).toThrow(/exact Transfer/);
  });

  it('simulates then transfers the exact allocation and never touches HoodLock', async () => {
    savePonsPendingLaunch(burnState());
    const writeContract = vi.fn(async () => burnHash);
    const publicClient = {
      readContract: vi.fn(async () => FIXTURE_TOKENS_OUT),
      simulateContract: vi.fn(async (req: { args: readonly [string, bigint] }) => ({
        request: { args: req.args },
      })),
      waitForTransactionReceipt: vi.fn(async () => receipt('success')),
    };
    const result = await broadcastBurnDevSupply({
      publicClient: publicClient as never,
      draftId,
      writeContract,
    });
    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'transfer',
        args: [DEV_SUPPLY_BURN_ADDRESS, FIXTURE_TOKENS_OUT],
      }),
    );
    expect(writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [DEV_SUPPLY_BURN_ADDRESS, FIXTURE_TOKENS_OUT],
      }),
    );
    expect(result.state.burnVerified).toBe(true);
    expect(result.state.hoodlockVerified).not.toBe(true);
    expect(result.burnTxHash).toBe(burnHash);
  });

  it('does not broadcast a second burn while a hash is unresolved', async () => {
    savePonsPendingLaunch(burnState({ burnTxHash: burnHash }));
    const publicClient = {
      getTransactionReceipt: vi.fn(async () => {
        throw new Error('pending');
      }),
    };
    const recovered = await recoverBurnFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(recovered.outcome).toBe('BURN_PENDING');
    await expect(
      broadcastBurnDevSupply({
        publicClient: publicClient as never,
        draftId,
        writeContract: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'TX_PENDING' });
    expect(loadPonsPendingLaunch(draftId)?.ponsTxHash).toBe(ponsHash);
  });

  it('clears a reverted burn hash so only the burn step can be retried', async () => {
    savePonsPendingLaunch(burnState({ burnTxHash: burnHash }));
    const recovered = await recoverBurnFromPending({
      publicClient: {
        getTransactionReceipt: vi.fn(async () => receipt('reverted')),
      } as never,
      draftId,
    });
    expect(recovered.outcome).toBe('BURN_REVERTED');
    expect(recovered.state.burnTxHash).toBeNull();
    expect(recovered.state.ponsTxHash).toBe(ponsHash);
    expect(recovered.state.burnVerified).not.toBe(true);
  });

  it('marks a confirmed burn verified and skips HoodLock', async () => {
    savePonsPendingLaunch(burnState({ burnTxHash: burnHash }));
    const recovered = await recoverBurnFromPending({
      publicClient: {
        getTransactionReceipt: vi.fn(async () => receipt('success')),
      } as never,
      draftId,
    });
    expect(recovered.outcome).toBe('BURN_CONFIRMED_RECOVERED');
    expect(recovered.state.burnVerified).toBe(true);
    expect(recovered.state.phase).toBe('burn_verified');
    expect(recovered.state.hoodlockLockTxHash).toBeNull();
  });

  it('refuses to burn a lock-policy draft', async () => {
    savePonsPendingLaunch(burnState({ devSupplyPolicy: 'lock_6m' }));
    await expect(
      broadcastBurnDevSupply({
        publicClient: {} as never,
        draftId,
        writeContract: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
