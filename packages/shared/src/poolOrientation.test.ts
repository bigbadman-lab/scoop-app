import { describe, expect, it } from 'vitest';
import {
  classifyBuySell,
  initialBuySwapDeltas,
  quoteAndTokenAmountsFromSwapDeltas,
  resolvePoolOrientation,
  ZERO_ADDRESS,
  HELLO_FIXTURE,
  priceQuoteX18FromSqrt,
  executionPriceQuoteX18,
} from './index.js';

/** Deterministic addresses that force both Uniswap sort orders. */
const TOKEN_LOW = '0x1111111111111111111111111111111111111111';
const TOKEN_HIGH = '0xffffffffffffffffffffffffffffffffffffffff';
const USDG = '0x5fc5360d00000000000000000000000000000000';
const STOCK = '0xaf3d0000000000000000000000000000000093f9';

describe('resolvePoolOrientation', () => {
  it('native ETH quote → quote=currency0, token=currency1', () => {
    const o = resolvePoolOrientation({
      tokenAddress: HELLO_FIXTURE.token,
      quoteAsset: ZERO_ADDRESS,
    });
    expect(o.currency0).toBe(ZERO_ADDRESS);
    expect(o.currency1).toBe(HELLO_FIXTURE.token);
    expect(o.tokenIsCurrency1).toBe(true);
  });

  it('ERC-20 quote with token address sorting before quote (token=currency0)', () => {
    expect(TOKEN_LOW < USDG).toBe(true);
    const o = resolvePoolOrientation({
      tokenAddress: TOKEN_LOW,
      quoteAsset: USDG,
    });
    expect(o).toEqual({
      currency0: TOKEN_LOW,
      currency1: USDG,
      tokenIsCurrency1: false,
    });
  });

  it('ERC-20 quote with token address sorting after quote (token=currency1)', () => {
    expect(TOKEN_HIGH > STOCK).toBe(true);
    const o = resolvePoolOrientation({
      tokenAddress: TOKEN_HIGH,
      quoteAsset: STOCK,
    });
    expect(o).toEqual({
      currency0: STOCK,
      currency1: TOKEN_HIGH,
      tokenIsCurrency1: true,
    });
  });

  it('validates matching Initialize currencies', () => {
    const o = resolvePoolOrientation({
      tokenAddress: TOKEN_LOW,
      quoteAsset: USDG,
      currency0: TOKEN_LOW,
      currency1: USDG,
    });
    expect(o.tokenIsCurrency1).toBe(false);
  });

  it('throws when Initialize currencies are an impossible pair', () => {
    expect(() =>
      resolvePoolOrientation({
        tokenAddress: TOKEN_LOW,
        quoteAsset: USDG,
        currency0: ZERO_ADDRESS,
        currency1: TOKEN_LOW,
      }),
    ).toThrow(/do not match/);
  });

  it('throws on out-of-order Initialize by default', () => {
    expect(() =>
      resolvePoolOrientation({
        tokenAddress: TOKEN_LOW,
        quoteAsset: USDG,
        currency0: USDG,
        currency1: TOKEN_LOW,
      }),
    ).toThrow(/canonical order/);
  });

  it('heals out-of-order stored currencies when prefer-sorted', () => {
    const o = resolvePoolOrientation({
      tokenAddress: TOKEN_LOW,
      quoteAsset: USDG,
      currency0: USDG,
      currency1: TOKEN_LOW,
      onCurrencyMismatch: 'prefer-sorted',
    });
    expect(o.currency0).toBe(TOKEN_LOW);
    expect(o.tokenIsCurrency1).toBe(false);
  });
});

describe('classifyBuySell both orientations', () => {
  it('token=currency1: buy and sell', () => {
    expect(classifyBuySell(-100n, 500n, true)).toBe('buy');
    expect(classifyBuySell(100n, -500n, true)).toBe('sell');
  });

  it('token=currency0: buy and sell', () => {
    expect(classifyBuySell(500n, -100n, false)).toBe('buy');
    expect(classifyBuySell(-500n, 100n, false)).toBe('sell');
  });

  it('preserves HELLO / default ETH orientation', () => {
    expect(
      classifyBuySell(-HELLO_FIXTURE.initialBuyQuote, HELLO_FIXTURE.initialBuyTokens),
    ).toBe('buy');
  });
});

describe('swap amount legs both orientations', () => {
  it('token=currency1 maps amount0→quote, amount1→token', () => {
    expect(
      quoteAndTokenAmountsFromSwapDeltas({
        amount0: -100n,
        amount1: 500n,
        tokenIsCurrency1: true,
      }),
    ).toEqual({ quoteAmountRaw: 100n, tokenAmountRaw: 500n });
  });

  it('token=currency0 maps amount1→quote, amount0→token', () => {
    expect(
      quoteAndTokenAmountsFromSwapDeltas({
        amount0: 500n,
        amount1: -100n,
        tokenIsCurrency1: false,
      }),
    ).toEqual({ quoteAmountRaw: 100n, tokenAmountRaw: 500n });
  });

  it('initialBuySwapDeltas synthesizes orientation-correct buy deltas', () => {
    expect(
      initialBuySwapDeltas({
        quoteAmountRaw: 100n,
        tokenAmountRaw: 500n,
        tokenIsCurrency1: true,
      }),
    ).toEqual({ amount0: -100n, amount1: 500n });
    expect(
      initialBuySwapDeltas({
        quoteAmountRaw: 100n,
        tokenAmountRaw: 500n,
        tokenIsCurrency1: false,
      }),
    ).toEqual({ amount0: 500n, amount1: -100n });
  });
});

describe('price both orientations', () => {
  it('execution price is orientation-independent once legs are correct', () => {
    const px = executionPriceQuoteX18({
      quoteAmountRaw: 100n,
      tokenAmountRaw: 50n,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    expect(px).toBe((100n * 10n ** 18n) / 50n);
  });

  it('priceQuoteX18FromSqrt uses non-inverse branch when token is currency0', () => {
    const sqrt = HELLO_FIXTURE.openingSqrtPriceX96;
    const asC1 = priceQuoteX18FromSqrt({
      sqrtPriceX96: sqrt,
      tokenIsCurrency1: true,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    const asC0 = priceQuoteX18FromSqrt({
      sqrtPriceX96: sqrt,
      tokenIsCurrency1: false,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    expect(asC0).not.toBe(asC1);
    expect(asC0 > 0n).toBe(true);
  });
});
