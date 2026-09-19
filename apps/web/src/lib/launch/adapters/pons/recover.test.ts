import { describe, expect, it, beforeEach, vi } from 'vitest';
import { recoverPonsLaunchFromPending } from './recover';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from './pending-storage';
import type { PonsPendingLaunchState } from './lifecycle-types';
import {
  FIXTURE_CREATOR,
  FIXTURE_CURVE,
  FIXTURE_TOKEN,
  FIXTURE_TOKENS_OUT,
  makeReceipt,
  makeTokenLaunchedLog,
  normalLaunchAndBuyReceipt,
} from './__fixtures__/receipts';

const draftId = 'recover-1';
const txHash =
  '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f' as const;

function pendingBase(
  over?: Partial<PonsPendingLaunchState>,
): PonsPendingLaunchState {
  const t = Date.now();
  return {
    version: 1,
    draftId,
    phase: 'launch_submitted',
    creator: FIXTURE_CREATOR,
    chainId: 4663,
    salt: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: '45000000000000000',
    slippageBps: 100,
    creatorTaxBps: 0,
    buybackEnabled: true,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://x',
    description: '',
    twitter: '',
    telegram: '',
    website: '',
    discord: '',
    farcaster: '',
    expectedEconomics: null,
    launchFeeWei: '500000000000000',
    requiredMsgValueWei: '45500000000000000',
    simulatedTokenAddress: null,
    simulatedCurveAddress: null,
    simulatedTokensOut: null,
    minTokensOut: null,
    ponsTxHash: txHash,
    tokenAddress: null,
    curveAddress: null,
    devTokensOut: null,
    actualQuoteIn: null,
    refundWei: null,
    receiptBlockNumber: null,
    lastError: null,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

describe('pons recovery', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch(draftId);
  });

  it('TX_PENDING when receipt fetch fails', async () => {
    savePonsPendingLaunch(pendingBase());
    const publicClient = {
      getTransactionReceipt: vi.fn(async () => {
        throw new Error('not found');
      }),
    };
    const result = await recoverPonsLaunchFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(result.outcome).toBe('TX_PENDING');
    expect(result.state.phase).toBe('launch_confirming');
    expect(result.state.ponsTxHash).toBe(txHash);
  });

  it('TX_REVERTED on reverted receipt', async () => {
    savePonsPendingLaunch(pendingBase());
    const receipt = {
      ...normalLaunchAndBuyReceipt(),
      status: 'reverted' as const,
    };
    const publicClient = {
      getTransactionReceipt: vi.fn(async () => receipt),
    };
    const result = await recoverPonsLaunchFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(result.outcome).toBe('TX_REVERTED');
    expect(result.state.phase).toBe('recoverable_failure');
    expect(result.state.ponsTxHash).toBe(txHash);
  });

  it('TX_CONFIRMED_RECOVERED restores exact devTokensOut', async () => {
    savePonsPendingLaunch(pendingBase());
    const publicClient = {
      getTransactionReceipt: vi.fn(async () => normalLaunchAndBuyReceipt()),
    };
    const result = await recoverPonsLaunchFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(result.outcome).toBe('TX_CONFIRMED_RECOVERED');
    expect(result.state.phase).toBe('lock_required');
    expect(result.state.devTokensOut).toBe(FIXTURE_TOKENS_OUT.toString(10));
    expect(result.state.tokenAddress?.toLowerCase()).toBe(
      FIXTURE_TOKEN.toLowerCase(),
    );
    expect(result.state.curveAddress?.toLowerCase()).toBe(
      FIXTURE_CURVE.toLowerCase(),
    );
    // Survives reload
    const reloaded = loadPonsPendingLaunch(draftId);
    expect(reloaded?.devTokensOut).toBe(FIXTURE_TOKENS_OUT.toString(10));
  });

  it('TX_CONFIRMED_DECODE_FAILED keeps tx hash', async () => {
    savePonsPendingLaunch(pendingBase());
    const bad = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
      // missing CurveBuy
    ]);
    const publicClient = {
      getTransactionReceipt: vi.fn(async () => bad),
    };
    const result = await recoverPonsLaunchFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(result.outcome).toBe('TX_CONFIRMED_DECODE_FAILED');
    expect(result.state.phase).toBe('recoverable_failure');
    expect(result.state.ponsTxHash).toBe(txHash);
  });

  it('ALREADY_LOCK_REQUIRED skips launch when token resolved', async () => {
    savePonsPendingLaunch(
      pendingBase({
        phase: 'lock_required',
        tokenAddress: FIXTURE_TOKEN,
        curveAddress: FIXTURE_CURVE,
        devTokensOut: FIXTURE_TOKENS_OUT.toString(10),
      }),
    );
    const publicClient = {
      getTransactionReceipt: vi.fn(),
    };
    const result = await recoverPonsLaunchFromPending({
      publicClient: publicClient as never,
      draftId,
    });
    expect(result.outcome).toBe('ALREADY_LOCK_REQUIRED');
    expect(publicClient.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
