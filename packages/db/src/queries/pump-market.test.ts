import { describe, expect, it } from 'vitest';
import {
  computePumpFdvSol,
  solDecimalToX18,
  applyPumpMarketStateToTokenDetail,
} from './pump-market.js';
import type { TokenDetail } from '../dto.js';

describe('solDecimalToX18', () => {
  it('converts whole SOL', () => {
    expect(solDecimalToX18('1')).toBe('1000000000000000000');
  });

  it('converts fractional SOL', () => {
    expect(solDecimalToX18('0.5')).toBe('500000000000000000');
  });
});

describe('computePumpFdvSol', () => {
  it('computes FDV from price × human supply', () => {
    // 1 SOL price × 1e9 tokens (1e15 raw / 1e6) = 1e9 SOL FDV
    const fdv = computePumpFdvSol({
      priceSol: '1',
      totalSupplyRaw: '1000000000000000',
      decimals: 6,
    });
    expect(fdv).toBe('1000000000');
  });

  it('returns null for bad supply', () => {
    expect(
      computePumpFdvSol({ priceSol: '1', totalSupplyRaw: '0', decimals: 6 }),
    ).toBeNull();
  });
});

describe('applyPumpMarketStateToTokenDetail', () => {
  const base = {
    chainId: 900001,
    tokenAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    marketSource: 'pump',
    priceQuoteX18: null,
    priceQuoteDisplay: null,
    volume24hQuoteRaw: null,
    volume24hQuoteDisplay: null,
    tradeCount24h: null,
  } as TokenDetail;

  it('does not invent zero price when state empty', () => {
    const out = applyPumpMarketStateToTokenDetail(base, null);
    expect(out.priceQuoteX18).toBeNull();
  });

  it('overlays SOL price and 24h stats', () => {
    const out = applyPumpMarketStateToTokenDetail(base, {
      chainId: 900001,
      mint: base.tokenAddress,
      priceSol: '0.002',
      fdvSol: '2000000',
      volume24hSol: '1.5',
      tradeCount24h: 3,
      buyCount24h: 2,
      sellCount24h: 1,
      lastTradeSignature: 'a'.repeat(64),
      lastTradeSlot: '9',
      lastTradeAt: new Date('2026-09-21T12:00:00Z'),
      lastEventCursor: null,
      updatedAt: new Date(),
    });
    expect(out.priceQuoteX18).toBe(solDecimalToX18('0.002'));
    expect(out.tradeCount24h).toBe(3);
    expect(out.buyCount24h).toBe(2);
    expect(out.sellCount24h).toBe(1);
    expect(out.priceUsdX18).toBeNull();
  });
});
