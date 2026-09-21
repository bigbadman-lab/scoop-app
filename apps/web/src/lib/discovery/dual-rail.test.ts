import { describe, expect, it } from 'vitest';
import type { TokenDiscoveryItem } from '@scoop/db';
import {
  mergeDiscoveryByLaunchedAt,
  rankDiscoverTrending,
} from '@/lib/discovery/dual-rail';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';

function item(
  overrides: Partial<TokenDiscoveryItem> &
    Pick<TokenDiscoveryItem, 'tokenAddress' | 'chainId' | 'launchedAt'>,
): TokenDiscoveryItem {
  return {
    name: 'T',
    symbol: 'T',
    decimals: 9,
    imageUri: '',
    displayImageUrl: null,
    marketSource: overrides.chainId === 900001 ? 'pump' : 'scoop',
    marketPhase: null,
    poolId: null,
    curveAddress: null,
    creatorId: 'creator',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    ageSeconds: 1,
    launchProgressBps: 0,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: null,
    priceQuoteDisplay: null,
    priceUsdX18: null,
    priceUsdDisplay: null,
    fdvUsdX18: null,
    fdvUsdDisplay: null,
    volume24hQuoteRaw: null,
    volume24hQuoteDisplay: null,
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: null,
    tradeCountAllTime: null,
    buyCount24h: null,
    sellCount24h: null,
    holderCountAll: null,
    holderCountRetail: null,
    lastTradeAt: null,
    priceChange24hBps: null,
    loreTitle: null,
    ...overrides,
  };
}

describe('mergeDiscoveryByLaunchedAt', () => {
  it('merges RHC + Pump NEW by launchedAt desc and keeps base58 mint', () => {
    const merged = mergeDiscoveryByLaunchedAt(
      [
        item({
          chainId: 4663,
          tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          launchedAt: 100,
          symbol: 'RHC',
        }),
      ],
      [
        item({
          chainId: 900001,
          tokenAddress: MINT,
          launchedAt: 200,
          symbol: 'SCPY',
          marketSource: 'pump',
          fdvUsdX18: null,
        }),
      ],
    );
    expect(merged.map((t) => t.symbol)).toEqual(['SCPY', 'RHC']);
    expect(merged[0]!.tokenAddress).toBe(MINT);
    expect(merged[0]!.marketSource).toBe('pump');
    expect(merged[0]!.fdvUsdX18).toBeNull();
  });

  it('dedupes by chainId:tokenAddress without lowercasing Solana', () => {
    const merged = mergeDiscoveryByLaunchedAt(
      [item({ chainId: 900001, tokenAddress: MINT, launchedAt: 1, name: 'A' })],
      [item({ chainId: 900001, tokenAddress: MINT, launchedAt: 2, name: 'B' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe('B');
    expect(merged[0]!.tokenAddress).toBe(MINT);
  });
});

describe('rankDiscoverTrending', () => {
  it('includes Solana when USD volume and trade count qualify', () => {
    const ranked = rankDiscoverTrending(
      [
        item({
          chainId: 4663,
          tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          launchedAt: 1,
          symbol: 'RHC',
          tradeCount24h: 5,
          buyCount24h: 3,
          volume24hUsdX18: '1000000000000000000',
        }),
        item({
          chainId: 900001,
          tokenAddress: MINT,
          launchedAt: 2,
          symbol: 'SCPY',
          marketSource: 'pump',
          tradeCount24h: 11,
          buyCount24h: 7,
          volume24hUsdX18: '500000000000000000000',
        }),
        item({
          chainId: 900001,
          tokenAddress: 'LowVolume1111111111111111111111111111111',
          launchedAt: 3,
          symbol: 'LOW',
          marketSource: 'pump',
          tradeCount24h: 11,
          volume24hUsdX18: null,
        }),
      ],
      { minTrades24h: 3 },
    );
    expect(ranked.map((t) => t.symbol)).toEqual(['SCPY', 'RHC']);
    expect(ranked[0]!.tokenAddress).toBe(MINT);
  });

  it('excludes rows below min trades even with USD volume', () => {
    const ranked = rankDiscoverTrending([
      item({
        chainId: 900001,
        tokenAddress: MINT,
        launchedAt: 1,
        symbol: 'SCPY',
        tradeCount24h: 2,
        volume24hUsdX18: '100000000000000000000',
      }),
    ]);
    expect(ranked).toHaveLength(0);
  });
});
