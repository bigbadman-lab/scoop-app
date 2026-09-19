import { describe, expect, it, beforeEach } from 'vitest';
import { assertPonsRelaunchAllowed } from './relaunch-guard';
import { PonsAdapterError } from './errors';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  savePonsPendingLaunch,
} from './pending-storage';
import type { PonsPendingLaunchState } from './lifecycle-types';
import { createOrResumePonsDraft } from '@/lib/launch/pons-orchestrate';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;

function stub(
  over: Partial<PonsPendingLaunchState> & { draftId: string },
): PonsPendingLaunchState {
  const t = Date.now();
  return {
    version: 1,
    phase: 'draft',
    creator,
    chainId: 4663,
    salt: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: '10000000000000000',
    slippageBps: 100,
    creatorTaxBps: 0,
    buybackEnabled: true,
    name: 'E',
    symbol: 'E',
    logo: 'ipfs://x',
    description: '',
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
    ponsTxHash: null,
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

describe('pons relaunch guard', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch('fresh');
    clearPonsPendingLaunch('salt-only');
    clearPonsPendingLaunch('with-tx');
    clearPonsPendingLaunch('with-token');
  });

  it('allows fresh draft', () => {
    expect(() =>
      assertPonsRelaunchAllowed(stub({ draftId: 'fresh' })),
    ).not.toThrow();
  });

  it('allows salt-only draft (simulation retry)', () => {
    const s = stub({ draftId: 'salt-only', phase: 'ready_to_sign' });
    savePonsPendingLaunch(s);
    expect(() => assertPonsRelaunchAllowed(s)).not.toThrow();
    expect(loadPonsPendingLaunch('salt-only')?.salt).toBe(s.salt);
  });

  it('blocks draft with ponsTxHash', () => {
    const s = stub({
      draftId: 'with-tx',
      ponsTxHash:
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      phase: 'launch_submitted',
    });
    expect(() => assertPonsRelaunchAllowed(s)).toThrow(PonsAdapterError);
    try {
      assertPonsRelaunchAllowed(s);
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('RELAUNCH_BLOCKED');
    }
  });

  it('blocks draft with resolved token', () => {
    const s = stub({
      draftId: 'with-token',
      tokenAddress: '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2',
      curveAddress: '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0',
      phase: 'lock_required',
    });
    expect(() => assertPonsRelaunchAllowed(s)).toThrow(PonsAdapterError);
  });

  it('restoring from storage preserves relaunch protection', () => {
    const s = stub({
      draftId: 'with-tx',
      ponsTxHash:
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      phase: 'launch_confirming',
    });
    savePonsPendingLaunch(s);
    const restored = loadPonsPendingLaunch('with-tx')!;
    expect(() => assertPonsRelaunchAllowed(restored)).toThrow(PonsAdapterError);
  });

  it('createOrResume does not replace salt on existing draft', () => {
    const first = createOrResumePonsDraft({
      draftId: 'salt-only',
      creator,
      name: 'A',
      symbol: 'A',
      logo: 'ipfs://a',
      description: '',
      quoteInWei: BigInt(10) ** BigInt(16),
      creatorTaxBps: 0,
      buybackEnabled: true,
    });
    const second = createOrResumePonsDraft({
      draftId: 'salt-only',
      creator,
      name: 'B',
      symbol: 'B',
      logo: 'ipfs://b',
      description: '',
      quoteInWei: BigInt(10) ** BigInt(16),
      creatorTaxBps: 0,
      buybackEnabled: true,
    });
    expect(second.salt).toBe(first.salt);
    expect(second.name).toBe(first.name);
  });
});
