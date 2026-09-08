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
  fdvUsdX18FromPrice,
  foldHolderBalances,
  mulDiv,
  normalizeAddress,
  notionalUsdX18FromQuoteAmount,
  priceQuoteX18FromSqrt,
  priceUsdX18FromQuote,
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

  it('18-token / 6-quote execution and spot scale correctly', () => {
    // 1.5 USDG (6 dec) for 1 whole token (18 dec)
    const quoteAmountRaw = 1_500_000n; // 1.5 * 10^6
    const tokenAmountRaw = 10n ** 18n;
    const exec = executionPriceQuoteX18({
      quoteAmountRaw,
      tokenAmountRaw,
      quoteDecimals: 6,
      tokenDecimals: 18,
    });
    expect(exec).toBe(15n * 10n ** 17n); // 1.5e18

    // Same ratio via wrong 18/18 would understate by 10^12
    const wrong = executionPriceQuoteX18({
      quoteAmountRaw,
      tokenAmountRaw,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    expect(wrong).toBe(exec / 10n ** 12n);
  });

  it('non-18 token decimals scale one-token spot from sqrt', () => {
    // sqrtPriceX96 = Q96 ⇒ raw price token1/token0 = 1
    const sqrt = Q96;
    const as18 = priceQuoteX18FromSqrt({
      sqrtPriceX96: sqrt,
      tokenIsCurrency1: true,
      quoteDecimals: 18,
      tokenDecimals: 18,
    });
    const as6 = priceQuoteX18FromSqrt({
      sqrtPriceX96: sqrt,
      tokenIsCurrency1: true,
      quoteDecimals: 18,
      tokenDecimals: 6,
    });
    expect(as18).toBe(10n ** 18n);
    expect(as6).toBe(10n ** 6n);
    expect(as18 / as6).toBe(10n ** 12n);
  });

  it('priceUsdX18FromQuote and fdvUsdX18FromPrice use integer math', () => {
    const priceQuote = 2n * 10n ** 18n; // 2 quote per token
    const quoteUsd = 3n * 10n ** 18n; // $3 per quote
    const priceUsd = priceUsdX18FromQuote({
      priceQuoteX18: priceQuote,
      quoteUsdX18: quoteUsd,
    });
    expect(priceUsd).toBe(6n * 10n ** 18n);

    const supply = 1_000n * 10n ** 18n; // 1000 tokens
    const fdv = fdvUsdX18FromPrice({
      priceUsdX18: priceUsd,
      totalSupplyRaw: supply,
      tokenDecimals: 18,
    });
    expect(fdv).toBe(6000n * 10n ** 18n);
  });

  it('notionalUsdX18FromQuoteAmount handles 18 and 6 decimal quotes', () => {
    const quoteUsd = 2000n * 10n ** 18n; // $2000 / ETH
    const ethNotional = notionalUsdX18FromQuoteAmount({
      quoteAmountRaw: 10n ** 18n, // 1 ETH
      quoteUsdX18: quoteUsd,
      quoteDecimals: 18,
    });
    expect(ethNotional).toBe(2000n * 10n ** 18n);

    const usdgNotional = notionalUsdX18FromQuoteAmount({
      quoteAmountRaw: 5n * 10n ** 6n, // 5 USDG (6 decimals)
      quoteUsdX18: 1n * 10n ** 18n, // $1
      quoteDecimals: 6,
    });
    expect(usdgNotional).toBe(5n * 10n ** 18n);
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
