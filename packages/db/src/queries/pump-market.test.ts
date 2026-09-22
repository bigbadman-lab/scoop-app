import { describe, expect, it } from 'vitest';
import {
  computePumpFdvSol,
  solDecimalToX18,
  applyPumpMarketStateToTokenDetail,
  mapPumpTradeRow,
} from './pump-market.js';
import type { TokenDetail } from '../dto.js';
import { priceUsdX18FromQuote, notionalUsdX18FromQuoteAmount } from '@scoop/shared';

describe('solDecimalToX18', () => {
  it('converts whole SOL', () => {
    expect(solDecimalToX18('1')).toBe('1000000000000000000');
  });

  it('converts fractional SOL', () => {
    expect(solDecimalToX18('0.5')).toBe('500000000000000000');
  });
});

describe('mapPumpTradeRow USD', () => {
  const baseRow = {
    signature: 'SigBuy111111111111111111111111111111111111111111111111111111111111',
    event_index: 0,
    slot: 100n,
    block_time: new Date('2026-09-22T12:00:00Z'),
    mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    curve_address: 'Curve111111111111111111111111111111111111111',
    wallet: 'Wallet11111111111111111111111111111111111111',
    token_amount_raw: '1000000',
    token_amount: '1',
    sol_amount: '0.25',
    sol_amount_lamports: '250000000',
    price_sol: '0.25',
  };

  it('buy with SOL → USD via notionalUsdX18FromQuoteAmount', () => {
    const solUsdX18 = 118n * 10n ** 18n; // $118 / SOL
    const trade = mapPumpTradeRow({ ...baseRow, side: 'buy' }, 6, solUsdX18);
    expect(trade.side).toBe('buy');
    expect(trade.quoteAmountDisplay).toMatch(/0\.25/);
    expect(trade.quoteUsdX18).toBe(solUsdX18.toString());

    const expectedNotional = notionalUsdX18FromQuoteAmount({
      quoteAmountRaw: BigInt(trade.quoteAmountRaw),
      quoteUsdX18: solUsdX18,
      quoteDecimals: 9,
    });
    const expectedExec = priceUsdX18FromQuote({
      priceQuoteX18: BigInt(trade.executionPriceQuoteX18!),
      quoteUsdX18: solUsdX18,
    });
    expect(trade.usdValueX18).toBe(expectedNotional.toString());
    expect(trade.usdValueDisplay).toBeTruthy();
    expect(trade.executionPriceUsdX18).toBe(expectedExec.toString());
    // 0.25 SOL × $118 = $29.5
    expect(Number(trade.usdValueDisplay)).toBeCloseTo(29.5, 5);
  });

  it('sell with SOL → USD', () => {
    const solUsdX18 = 100n * 10n ** 18n;
    const trade = mapPumpTradeRow(
      { ...baseRow, side: 'sell', sol_amount: '1', price_sol: '1' },
      6,
      solUsdX18,
    );
    expect(trade.side).toBe('sell');
    expect(trade.usdValueX18).toBe(
      notionalUsdX18FromQuoteAmount({
        quoteAmountRaw: BigInt(trade.quoteAmountRaw),
        quoteUsdX18: solUsdX18,
        quoteDecimals: 9,
      }).toString(),
    );
    expect(trade.usdValueDisplay).toBeTruthy();
    expect(Number(trade.usdValueDisplay)).toBeCloseTo(100, 5);
  });

  it('SOL/USD missing → null USD, SOL quote remains', () => {
    const trade = mapPumpTradeRow({ ...baseRow, side: 'buy' }, 6, null);
    expect(trade.quoteAmountDisplay).toMatch(/0\.25/);
    expect(trade.executionPriceQuoteX18).toBeTruthy();
    expect(trade.quoteUsdX18).toBeNull();
    expect(trade.usdValueX18).toBeNull();
    expect(trade.usdValueDisplay).toBeNull();
    expect(trade.executionPriceUsdX18).toBeNull();
  });

  it('zero solUsdX18 does not fabricate $0', () => {
    const trade = mapPumpTradeRow({ ...baseRow, side: 'buy' }, 6, 0n);
    expect(trade.usdValueX18).toBeNull();
    expect(trade.usdValueDisplay).toBeNull();
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

  const state = {
    chainId: 900001 as const,
    mint: base.tokenAddress,
    priceSol: '0.000000028141244551',
    fdvSol: '28.141244551',
    volume24hSol: '4.630255521',
    tradeCount24h: 11,
    buyCount24h: 7,
    sellCount24h: 4,
    lastTradeSignature: 'a'.repeat(64),
    lastTradeSlot: '9',
    lastTradeAt: new Date('2026-09-21T12:00:00Z'),
    lastEventCursor: null,
    holderCount: null as number | null,
    holdersUpdatedAt: null as Date | null,
    updatedAt: new Date(),
  };

  it('does not invent zero price when state empty', () => {
    const out = applyPumpMarketStateToTokenDetail(base, null);
    expect(out.priceQuoteX18).toBeNull();
  });

  it('overlays SOL price and 24h stats without USD when solUsd missing', () => {
    const out = applyPumpMarketStateToTokenDetail(base, {
      ...state,
      priceSol: '0.002',
      fdvSol: '2000000',
      volume24hSol: '1.5',
      tradeCount24h: 3,
      buyCount24h: 2,
      sellCount24h: 1,
    });
    expect(out.priceQuoteX18).toBe(solDecimalToX18('0.002'));
    expect(out.tradeCount24h).toBe(3);
    expect(out.tradeCountAllTime).toBe(3);
    expect(out.buyCount24h).toBe(2);
    expect(out.sellCount24h).toBe(1);
    expect(out.priceUsdX18).toBeNull();
    expect(out.fdvUsdDisplay).toBeNull();
    expect(out.fdvQuoteDisplay).toBeTruthy();
    expect(out.fdvQuoteDisplay).not.toMatch(/^\$/);
  });

  it('derives USD price/FDV/volume via solUsdX18 with x18 precision', () => {
    const solUsdX18 = 150n * 10n ** 18n; // $150 / SOL
    const out = applyPumpMarketStateToTokenDetail(base, state, solUsdX18);

    const expectedPrice = priceUsdX18FromQuote({
      priceQuoteX18: BigInt(solDecimalToX18(state.priceSol!)),
      quoteUsdX18: solUsdX18,
    });
    const expectedFdv = priceUsdX18FromQuote({
      priceQuoteX18: BigInt(solDecimalToX18(state.fdvSol!)),
      quoteUsdX18: solUsdX18,
    });
    const expectedVol = notionalUsdX18FromQuoteAmount({
      quoteAmountRaw: BigInt(out.volume24hQuoteRaw!),
      quoteUsdX18: solUsdX18,
      quoteDecimals: 9,
    });

    expect(out.priceUsdX18).toBe(expectedPrice.toString());
    expect(out.fdvUsdX18).toBe(expectedFdv.toString());
    expect(out.volume24hUsdX18).toBe(expectedVol.toString());
    expect(out.priceUsdDisplay).toBeTruthy();
    expect(out.fdvUsdDisplay).toBeTruthy();
    expect(out.volume24hUsdDisplay).toBeTruthy();
    expect(out.priceQuoteDisplay).toBeTruthy();
    expect(out.fdvQuoteDisplay).toBeTruthy();
  });

  it('does not fabricate USD from zero solUsdX18', () => {
    const out = applyPumpMarketStateToTokenDetail(base, state, 0n);
    expect(out.priceUsdX18).toBeNull();
    expect(out.fdvUsdX18).toBeNull();
    expect(out.volume24hUsdX18).toBeNull();
  });

  it('maps holder_count into shared holderCountAll/Retail fields', () => {
    const out = applyPumpMarketStateToTokenDetail(base, {
      ...state,
      holderCount: 12,
    });
    expect(out.holderCountAll).toBe(12);
    expect(out.holderCountRetail).toBe(12);
  });

  it('applies holders even when price_sol is null', () => {
    const out = applyPumpMarketStateToTokenDetail(base, {
      ...state,
      priceSol: null,
      holderCount: 4,
    });
    expect(out.priceQuoteX18).toBeNull();
    expect(out.holderCountAll).toBe(4);
  });
});
