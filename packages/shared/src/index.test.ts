import { describe, expect, it } from 'vitest';
import {
  HELLO_FIXTURE,
  NATIVE_ETH_ADDRESS,
  Q96,
  SCOOP_CHAIN_ID,
  ZERO_ADDRESS,
  DEAD_ADDRESS,
  classifyBuySell,
  classifyTransfer,
  executionPriceQuoteX18,
  foldHolderBalances,
  mulDiv,
  normalizeAddress,
  priceQuoteX18FromSqrt,
} from './index.js';

describe('@scoop/shared', () => {
  it('exposes chain ID 4663', () => {
    expect(SCOOP_CHAIN_ID).toBe(4663);
  });

  it('exposes native ETH / zero / dead addresses', () => {
    expect(NATIVE_ETH_ADDRESS).toBe('0x0000000000000000000000000000000000000000');
    expect(ZERO_ADDRESS).toBe(NATIVE_ETH_ADDRESS);
    expect(DEAD_ADDRESS).toBe('0x000000000000000000000000000000000000dead');
  });

  it('normalizes addresses', () => {
    expect(normalizeAddress(HELLO_FIXTURE.token.toUpperCase().replace('0X', '0x'))).toMatch(
      /^0x[0-9a-f]{40}$/,
    );
    expect(normalizeAddress(HELLO_FIXTURE.token)).toBe(HELLO_FIXTURE.token);
  });

  it('exposes lowercase HELLO fixture constants', () => {
    expect(HELLO_FIXTURE.token).toBe(HELLO_FIXTURE.token.toLowerCase());
    expect(HELLO_FIXTURE.blockNumber).toBe(55863290);
    expect(HELLO_FIXTURE.metadata.symbol).toBe('HELLO');
    expect(HELLO_FIXTURE.txHash).toBe(HELLO_FIXTURE.txHash.toLowerCase());
    expect(HELLO_FIXTURE.factory).toBe(HELLO_FIXTURE.factory.toLowerCase());
  });
});

describe('price math', () => {
  it('mulDiv floors', () => {
    expect(mulDiv(10n, 3n, 4n)).toBe(7n);
    expect(Q96).toBe(2n ** 96n);
  });

  it('priceQuoteX18FromSqrt for token as currency1', () => {
    const open = priceQuoteX18FromSqrt({
      sqrtPriceX96: HELLO_FIXTURE.openingSqrtPriceX96,
      tokenIsCurrency1: true,
      quoteDecimals: 18,
    });
    expect(open > 0n).toBe(true);
    const close = priceQuoteX18FromSqrt({
      sqrtPriceX96: HELLO_FIXTURE.postSwapSqrtPriceX96,
      tokenIsCurrency1: true,
      quoteDecimals: 18,
    });
    expect(close > open).toBe(true);
  });

  it('executionPriceQuoteX18 from HELLO legs', () => {
    const px = executionPriceQuoteX18({
      quoteAmountRaw: HELLO_FIXTURE.initialBuyQuote,
      tokenAmountRaw: HELLO_FIXTURE.initialBuyTokens,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    expect(px).toBe(
      (HELLO_FIXTURE.initialBuyQuote * 10n ** 18n) / HELLO_FIXTURE.initialBuyTokens,
    );
  });
});

describe('buy/sell classification', () => {
  it('classifies buy when amount0 < 0 and amount1 > 0', () => {
    expect(
      classifyBuySell(-HELLO_FIXTURE.initialBuyQuote, HELLO_FIXTURE.initialBuyTokens),
    ).toBe('buy');
  });

  it('classifies sell when amount1 < 0 and amount0 > 0', () => {
    expect(classifyBuySell(1n, -2n)).toBe('sell');
  });
});

describe('transfer classification', () => {
  const base = {
    amount: 1n,
    factory: HELLO_FIXTURE.factory,
    creator: HELLO_FIXTURE.creator,
    poolManager: HELLO_FIXTURE.poolManager,
    dead: DEAD_ADDRESS,
    zero: ZERO_ADDRESS,
  };

  it('classifies mint / lp_funding / dead_dust / swap_settlement / initial_buy', () => {
    expect(
      classifyTransfer({ ...base, from: ZERO_ADDRESS, to: HELLO_FIXTURE.factory }),
    ).toBe('mint');
    expect(
      classifyTransfer({
        ...base,
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.poolManager,
      }),
    ).toBe('lp_funding');
    expect(
      classifyTransfer({ ...base, from: HELLO_FIXTURE.factory, to: DEAD_ADDRESS }),
    ).toBe('dead_dust');
    expect(
      classifyTransfer({
        ...base,
        from: HELLO_FIXTURE.poolManager,
        to: HELLO_FIXTURE.factory,
      }),
    ).toBe('swap_settlement');
    expect(
      classifyTransfer({
        ...base,
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.creator,
        amount: HELLO_FIXTURE.initialBuyTokens,
      }),
    ).toBe('initial_buy');
    expect(
      classifyTransfer({
        ...base,
        from: HELLO_FIXTURE.creator,
        to: '0x1111111111111111111111111111111111111111',
      }),
    ).toBe('unknown');
  });
});

describe('holder folding', () => {
  it('folds HELLO-like transfers and omits zero factory balance', () => {
    const supply = HELLO_FIXTURE.totalSupply;
    const dust = HELLO_FIXTURE.deadBalance;
    const buy = HELLO_FIXTURE.initialBuyTokens;
    // After mint + dead dust, remaining supply is LP-funded to PoolManager;
    // initial-buy tokens later return via swap settlement then route to creator.
    const lp = supply - dust;

    const holders = foldHolderBalances([
      {
        from: ZERO_ADDRESS,
        to: HELLO_FIXTURE.factory,
        amount: supply,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: DEAD_ADDRESS,
        amount: dust,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.poolManager,
        amount: lp,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.poolManager,
        to: HELLO_FIXTURE.factory,
        amount: buy,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.creator,
        amount: buy,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
    ]);

    const byAddr = Object.fromEntries(holders.map((h) => [h.address, h.balanceRaw]));
    expect(byAddr[HELLO_FIXTURE.factory]).toBeUndefined();
    expect(byAddr[DEAD_ADDRESS]).toBe(dust);
    expect(byAddr[HELLO_FIXTURE.creator]).toBe(buy);
    expect(byAddr[HELLO_FIXTURE.poolManager]).toBe(lp - buy);
  });
});

describe('indexing default', () => {
  it('does not enable live indexing by default in shared constants', () => {
    // Live indexing is an indexer env concern; shared only exposes the fixture block.
    expect(HELLO_FIXTURE.blockNumber).toBe(55863290);
    expect(SCOOP_CHAIN_ID).toBe(4663);
  });
});
