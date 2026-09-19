import { describe, expect, it } from 'vitest';
import {
  MARKET_SOURCES,
  curveSyntheticPoolId,
  creatorIdFromWallet,
  marketPhaseFromGraduationStatus,
  normalizeMarketSource,
} from './marketSource.js';

describe('marketSource (Gate 6)', () => {
  it('exports scoop | pons_v2', () => {
    expect(MARKET_SOURCES).toEqual(['scoop', 'pons_v2']);
  });

  it('defaults unknown to scoop', () => {
    expect(normalizeMarketSource(undefined)).toBe('scoop');
    expect(normalizeMarketSource('pons_v2')).toBe('pons_v2');
  });

  it('maps graduation status to marketPhase', () => {
    expect(marketPhaseFromGraduationStatus('scoop', null)).toBeNull();
    expect(marketPhaseFromGraduationStatus('pons_v2', 'curve')).toBe('curve');
    expect(marketPhaseFromGraduationStatus('pons_v2', 'graduated')).toBe(
      'graduated_pool',
    );
  });

  it('builds synthetic pool id from curve address', () => {
    const id = curveSyntheticPoolId('0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2');
    expect(id).toBe(
      '0x0000000000000000000000005806a32ad9b52b39d1836d18a6c16328105abda2',
    );
  });

  it('builds creator id from wallet', () => {
    const id = creatorIdFromWallet('0x5Fd466ba9576527974FEC62cF96D058FC667F70f');
    expect(id).toBe(
      '0x0000000000000000000000005fd466ba9576527974fec62cf96d058fc667f70f',
    );
  });
});
