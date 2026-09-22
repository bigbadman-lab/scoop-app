import { describe, expect, it } from 'vitest';
import type { MarketsBoardItem } from '@/lib/markets/types';
import { buildMarketsBoardItems } from '@/lib/markets/types';
import {
  applyMarketsBoardView,
  filterMarketsBoardItems,
  formatMarketsFeedUpdatedAt,
  MARKETS_SORT_OPTIONS,
  marketsViewLeaderId,
  sortMarketsBoardItems,
} from '@/lib/markets/view';
import type { TokenDiscoveryItem } from '@scoop/db';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const NOMI = '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b';
const MOSS = '0xa3f47a8a3032707b8bd414e96beebe82c97b4336';
const FORGE = '0x1545556c103c307ca2e82e637ee92719099903b6';

function market(
  partial: Partial<MarketsBoardItem> & Pick<MarketsBoardItem, 'tokenAddress'>,
): MarketsBoardItem {
  return {
    chainId: 4663,
    marketSource: 'scoop',
    name: 'Hello',
    symbol: 'HELLO',
    imageUri: '',
    displayImageUrl: null,
    quoteAsset: '0x0000000000000000000000000000000000000000',
    quoteSymbol: 'ETH',
    quoteImageUrl: null,
    launchedAt: 1_700_000_000,
    ageSeconds: 100,
    fdvUsdX18: '1000',
    fdvUsdDisplay: '1000',
    fdvQuoteDisplay: null,
    priceUsdDisplay: null,
    priceQuoteDisplay: null,
    volume24hUsdDisplay: null,
    volume24hQuoteDisplay: null,
    tradeCountAllTime: 10,
    tradeCount24h: 1,
    holderCountAll: 5,
    holderCountRetail: 4,
    loreTitle: null,
    scoopSupportBuyCount: null,
    scoopSupportTotalSol: null,
    ...partial,
  };
}

const sample = [
  market({
    tokenAddress: '0xaaa',
    name: 'Alpha',
    symbol: 'ALPHA',
    launchedAt: 100,
    tradeCountAllTime: 5,
    fdvUsdX18: '300',
    holderCountRetail: 2,
  }),
  market({
    tokenAddress: '0xbbb',
    name: 'Coinbase',
    symbol: 'COIN',
    launchedAt: 300,
    tradeCountAllTime: 50,
    fdvUsdX18: '200',
    holderCountRetail: 20,
  }),
  market({
    tokenAddress: '0xccc',
    name: 'Hello World',
    symbol: 'HELLO',
    launchedAt: 200,
    tradeCountAllTime: null,
    fdvUsdX18: '100',
    holderCountRetail: null,
    holderCountAll: null,
  }),
];

describe('MARKETS_SORT_OPTIONS', () => {
  it('exposes Trending, FDV, Newest, Trades, Holders', () => {
    expect(MARKETS_SORT_OPTIONS.map((o) => o.id)).toEqual([
      'trending',
      'fdv',
      'newest',
      'trades',
      'holders',
    ]);
  });
});

describe('sortMarketsBoardItems', () => {
  it('Trending preserves incoming order', () => {
    expect(sortMarketsBoardItems(sample, 'trending').map((m) => m.tokenAddress)).toEqual([
      '0xaaa',
      '0xbbb',
      '0xccc',
    ]);
  });

  it('FDV sorts desc with nulls last and never drops rows', () => {
    const withNull = [
      ...sample,
      market({
        tokenAddress: MINT,
        chainId: 900001,
        marketSource: 'pump',
        symbol: 'SCPY',
        fdvUsdX18: null,
        holderCountAll: null,
        holderCountRetail: null,
      }),
    ];
    const sorted = sortMarketsBoardItems(withNull, 'fdv');
    expect(sorted).toHaveLength(4);
    expect(sorted.map((m) => m.tokenAddress)).toEqual([
      '0xaaa',
      '0xbbb',
      '0xccc',
      MINT,
    ]);
  });

  it('Newest sorts by launchedAt descending', () => {
    expect(sortMarketsBoardItems(sample, 'newest').map((m) => m.tokenAddress)).toEqual([
      '0xbbb',
      '0xccc',
      '0xaaa',
    ]);
  });

  it('Most traded sorts by tradeCountAllTime descending with nulls last', () => {
    expect(sortMarketsBoardItems(sample, 'trades').map((m) => m.tokenAddress)).toEqual([
      '0xbbb',
      '0xaaa',
      '0xccc',
    ]);
  });

  it('Holders sorts desc with null holders last and never drops rows', () => {
    const sorted = sortMarketsBoardItems(sample, 'holders');
    expect(sorted).toHaveLength(3);
    expect(sorted.map((m) => m.tokenAddress)).toEqual([
      '0xbbb',
      '0xaaa',
      '0xccc',
    ]);
  });
});

describe('filterMarketsBoardItems', () => {
  it('filters by token name', () => {
    expect(filterMarketsBoardItems(sample, 'coin').map((m) => m.symbol)).toEqual(['COIN']);
  });

  it('filters by ticker', () => {
    expect(filterMarketsBoardItems(sample, 'hello').map((m) => m.symbol)).toEqual(['HELLO']);
  });

  it('filters by quote symbol', () => {
    expect(filterMarketsBoardItems(sample, 'eth')).toHaveLength(3);
  });

  it('empty query restores all rows', () => {
    expect(filterMarketsBoardItems(sample, '  ')).toHaveLength(3);
  });
});

describe('applyMarketsBoardView', () => {
  it('applies sort then search', () => {
    const rows = applyMarketsBoardView(sample, { sort: 'newest', query: 'a' });
    expect(rows.map((m) => m.symbol)).toEqual(['COIN', 'ALPHA']);
  });

  it('preserves canonical view ranks through search (does not renumber)', () => {
    const rows = applyMarketsBoardView(sample, { sort: 'trending', query: 'hello' });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.symbol).toBe('HELLO');
    expect(rows[0]!.rank).toBe(3);
    expect(rows[0]!.rank).not.toBe(1);
  });

  it('every sort mode keeps the full catalogue length', () => {
    for (const option of MARKETS_SORT_OPTIONS) {
      const rows = applyMarketsBoardView(sample, { sort: option.id, query: '' });
      expect(rows).toHaveLength(sample.length);
    }
  });
});

describe('marketsViewLeaderId', () => {
  it('returns the #1 token for the active sort', () => {
    expect(marketsViewLeaderId(sample, 'trending')).toBe('0xaaa');
    expect(marketsViewLeaderId(sample, 'newest')).toBe('0xbbb');
    expect(marketsViewLeaderId(sample, 'trades')).toBe('0xbbb');
    expect(marketsViewLeaderId(sample, 'holders')).toBe('0xbbb');
    expect(marketsViewLeaderId(sample, 'fdv')).toBe('0xaaa');
  });
});

describe('formatMarketsFeedUpdatedAt', () => {
  it('formats live and stale ages', () => {
    const now = 1_000_000;
    expect(formatMarketsFeedUpdatedAt(now, now, 'live')).toBe('Updated now');
    expect(formatMarketsFeedUpdatedAt(now - 2000, now, 'live')).toBe('Updated 2s ago');
    expect(formatMarketsFeedUpdatedAt(now - 8000, now, 'stale')).toBe('Last updated 8s ago');
  });
});

describe('full market catalogue cross-chain visibility', () => {
  const catalogue: PublicQuoteCatalogueItem[] = [
    {
      quoteAsset: '0x0000000000000000000000000000000000000000',
      symbol: 'ETH',
      displaySymbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      imageUrl: null,
      category: 'crypto',
      sortOrder: 1,
      isRegistered: true,
      isEnabled: true,
      chainId: 4663,
      quoteType: 'native',
      sourceName: null,
    },
  ];

  function discovery(
    overrides: Partial<TokenDiscoveryItem> &
      Pick<TokenDiscoveryItem, 'tokenAddress' | 'chainId' | 'symbol'>,
  ): TokenDiscoveryItem {
    return {
      name: overrides.symbol,
      decimals: 18,
      imageUri: '',
      displayImageUrl: null,
      marketSource: overrides.chainId === 900001 ? 'pump' : 'scoop',
      marketPhase: null,
      poolId: null,
      curveAddress: null,
      creatorId: '0x1111111111111111111111111111111111111111',
      quoteAsset: '0x0000000000000000000000000000000000000000',
      launchedAt: 1,
      ageSeconds: 100,
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

  it('keeps Solana + PONS + legacy RHC visible with null FDV and null holders', () => {
    const tokens = [
      discovery({
        chainId: 900001,
        tokenAddress: MINT,
        symbol: 'SCPY',
        marketSource: 'pump',
        launchedAt: 400,
        fdvUsdX18: '3325',
        tradeCountAllTime: 11,
        holderCountAll: null,
      }),
      discovery({
        chainId: 4663,
        tokenAddress: NOMI,
        symbol: '$NOMI',
        marketSource: 'pons_v2',
        launchedAt: 300,
        fdvUsdX18: '4642',
        holderCountAll: 0,
        holderCountRetail: 0,
      }),
      discovery({
        chainId: 4663,
        tokenAddress: MOSS,
        symbol: 'MOSS',
        marketSource: 'pons_v2',
        launchedAt: 200,
        fdvUsdX18: null,
        holderCountAll: 0,
      }),
      discovery({
        chainId: 4663,
        tokenAddress: FORGE,
        symbol: 'FORGE',
        launchedAt: 100,
        fdvUsdX18: '5985',
        holderCountRetail: 2,
        tradeCountAllTime: 0,
      }),
      discovery({
        chainId: 4663,
        tokenAddress: '0xlowfdv000000000000000000000000000000001',
        symbol: 'LOW',
        launchedAt: 50,
        fdvUsdX18: '1',
        holderCountRetail: 1,
      }),
    ];

    const board = buildMarketsBoardItems(tokens, catalogue);
    expect(board).toHaveLength(5);
    expect(board.map((b) => b.tokenAddress)).toEqual(
      expect.arrayContaining([MINT, NOMI, MOSS, FORGE]),
    );
    expect(board.find((b) => b.tokenAddress === MOSS)?.fdvUsdX18).toBeNull();
    expect(board.find((b) => b.tokenAddress === MINT)?.holderCountAll).toBeNull();

    for (const option of MARKETS_SORT_OPTIONS) {
      const view = applyMarketsBoardView(board, { sort: option.id, query: '' });
      expect(view).toHaveLength(5);
      expect(view.map((r) => r.tokenAddress).sort()).toEqual(
        board.map((r) => r.tokenAddress).sort(),
      );
    }

    // Base58 mint preserved (not lowercased).
    expect(board.find((b) => b.symbol === 'SCPY')!.tokenAddress).toBe(MINT);
  });
});
