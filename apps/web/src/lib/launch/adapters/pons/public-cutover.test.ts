import { describe, expect, it } from 'vitest';
import {
  PONS_SCHEMA_BLOCKED_MESSAGE,
  ponsPendingToDecoded,
  ponsPhaseToTxPhase,
} from '../../run-public-pons-launch';
import type { PonsPendingLaunchState } from './lifecycle-types';
import { emptyHoodlockFields } from './lifecycle-types';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;

function stub(
  over: Partial<PonsPendingLaunchState> & { draftId: string },
): PonsPendingLaunchState {
  return {
    version: 1,
    phase: 'draft',
    creator,
    chainId: 4663,
    salt: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    launchConfigId: '0',
    pairToken: '0x0000000000000000000000000000000000000000',
    quoteInWei: '100000000000000000',
    slippageBps: 100,
    creatorTaxBps: 0,
    buybackEnabled: true,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://bafy',
    description: 'desc',
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
    createdAt: 1,
    updatedAt: 1,
    ...emptyHoodlockFields(),
    ...over,
  };
}

describe('Gate 7 public Pons helpers', () => {
  it('blocks with canonical schema message', () => {
    expect(PONS_SCHEMA_BLOCKED_MESSAGE).toBe(
      'BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY',
    );
  });

  it('maps lock_verified phase and decode without UV4 pool requirement', () => {
    const pending = stub({
      draftId: 'd1',
      phase: 'lock_verified',
      ponsTxHash: ('0x' + '11'.repeat(32)) as `0x${string}`,
      tokenAddress: ('0x' + '22'.repeat(20)) as `0x${string}`,
      curveAddress: ('0x' + '33'.repeat(20)) as `0x${string}`,
      devTokensOut: '1000',
      hoodlockVerified: true,
    });
    expect(ponsPhaseToTxPhase(pending.phase)).toBe('lock_verified');
    const decoded = ponsPendingToDecoded(pending);
    expect(decoded?.token.toLowerCase()).toBe(pending.tokenAddress!.toLowerCase());
    expect(decoded?.quoteAsset).toBe(
      '0x0000000000000000000000000000000000000000',
    );
  });

  it('maps lock_required to resume UX phase', () => {
    expect(ponsPhaseToTxPhase('lock_required')).toBe('lock_required');
  });
});
