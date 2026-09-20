import { describe, expect, it } from 'vitest';
import {
  canUseScoopUv4TradePath,
  PONS_TRADE_DISABLED_COPY,
} from './market-source-guard';

describe('market-source trade guard (Gate 6)', () => {
  it('allows Scoop markets with a full UV4 pool key', () => {
    expect(
      canUseScoopUv4TradePath({
        marketSource: 'scoop',
        currency0: '0x0000000000000000000000000000000000000000',
        currency1: '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2',
        poolFee: 10000,
        tickSpacing: 200,
        hooks: '0x0000000000000000000000000000000000000000',
      }),
    ).toBe(true);
  });

  it('blocks Pons curve markets even if UV4 fields are present', () => {
    expect(
      canUseScoopUv4TradePath({
        marketSource: 'pons_v2',
        marketPhase: 'curve',
        currency0: '0x0000000000000000000000000000000000000000',
        currency1: '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2',
        poolFee: 10000,
        tickSpacing: 200,
        hooks: '0x0000000000000000000000000000000000000000',
      }),
    ).toBe(false);
  });

  it('blocks Scoop markets missing pool key fields', () => {
    expect(
      canUseScoopUv4TradePath({
        marketSource: 'scoop',
        currency0: null,
        currency1: null,
        poolFee: null,
        tickSpacing: null,
        hooks: null,
      }),
    ).toBe(false);
  });

  it('blocks Pump markets (no Scoop UV4 path)', () => {
    expect(
      canUseScoopUv4TradePath({
        marketSource: 'pump',
        currency0: null,
        currency1: null,
        poolFee: null,
        tickSpacing: null,
        hooks: null,
      }),
    ).toBe(false);
  });

  it('exposes safe disabled copy', () => {
    expect(PONS_TRADE_DISABLED_COPY.toLowerCase()).toContain('pons');
  });
});
