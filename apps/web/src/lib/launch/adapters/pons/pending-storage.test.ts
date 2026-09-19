import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetPonsPendingLaunchMemoryForTests,
  clearPonsPendingLaunch,
  loadPonsPendingLaunch,
  parsePonsPendingLaunchState,
  savePonsPendingLaunch,
} from './pending-storage';
import type { PonsPendingLaunchState } from './lifecycle-types';
import { bigintToDecimal, emptyHoodlockFields } from './lifecycle-types';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;
const salt =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;

function baseState(
  over?: Partial<PonsPendingLaunchState>,
): PonsPendingLaunchState {
  const t = Date.now();
  return {
    version: 1,
    draftId: 'draft-1',
    phase: 'draft',
    creator,
    chainId: 4663,
    salt,
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: bigintToDecimal(BigInt(10) ** BigInt(16)),
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
    ponsTxHash: null,
    tokenAddress: null,
    curveAddress: null,
    devTokensOut: null,
    actualQuoteIn: null,
    refundWei: null,
    receiptBlockNumber: null,
    lastError: null,
    ...emptyHoodlockFields(),
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

describe('pons pending storage', () => {
  beforeEach(() => {
    __resetPonsPendingLaunchMemoryForTests();
    clearPonsPendingLaunch('draft-1');
  });

  it('round-trips bigint-safe decimal fields', () => {
    const state = baseState({
      quoteInWei: '45000000000000000',
      launchFeeWei: '500000000000000',
      ponsTxHash:
        '0x10ada643ab9b790aa4d50ec91d65d11844df1049615e779c2c219eea05a69d3f',
      tokenAddress: '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2',
      curveAddress: '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0',
      devTokensOut: '25324166739187189974762857',
      phase: 'lock_required',
    });
    savePonsPendingLaunch(state);
    const loaded = loadPonsPendingLaunch('draft-1');
    expect(loaded?.quoteInWei).toBe('45000000000000000');
    expect(loaded?.devTokensOut).toBe('25324166739187189974762857');
    expect(loaded?.ponsTxHash).toBe(state.ponsTxHash);
    expect(loaded?.tokenAddress?.toLowerCase()).toBe(
      state.tokenAddress!.toLowerCase(),
    );
    expect(loaded?.salt).toBe(salt);
    expect(loaded?.phase).toBe('lock_required');
  });

  it('rejects corrupt / wrong version payloads', () => {
    expect(parsePonsPendingLaunchState({ version: 99 })).toBeNull();
    expect(parsePonsPendingLaunchState({ version: 1, draftId: '' })).toBeNull();
    expect(
      parsePonsPendingLaunchState({
        ...baseState(),
        quoteInWei: 'not-a-number',
      }),
    ).toBeNull();
    expect(
      parsePonsPendingLaunchState({
        ...baseState(),
        ponsTxHash: '0x1234',
      }),
    ).toBeNull();
  });

  it('persists salt across save/load', () => {
    savePonsPendingLaunch(baseState());
    expect(loadPonsPendingLaunch('draft-1')?.salt).toBe(salt);
  });
});
