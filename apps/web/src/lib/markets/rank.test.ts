import { describe, expect, it } from 'vitest';
import {
  compareMarketsByFdvDesc,
  hasValidFdv,
  rankMarketsByFdv,
} from '@/lib/markets/rank';
import { buildMarketsBoardItems, type MarketsBoardItem } from '@/lib/markets/types';
import type { TokenDiscoveryItem } from '@scoop/db';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

function token(
  overrides: Partial<TokenDiscoveryItem> & Pick<TokenDiscoveryItem, 'tokenAddress' | 'symbol'>,
): TokenDiscoveryItem {
  return {
    chainId: 4663,
    name: overrides.name ?? overrides.symbol,
    decimals: 18,
    imageUri: '',
    displayImageUrl: null,
    poolId: '0xpool',
    creatorId: '0x1111111111111111111111111111111111111111',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    launchedAt: 1,
    ageSeconds: 100,
    launchProgressBps: 0,
    launchComplete: false,
    isNew: false,
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
    buyCount24h: null,
    sellCount24h: null,
    holderCountAll: null,
    holderCountRetail: null,
    lastTradeAt: null,
    priceChange24hBps: null,
    ...overrides,
  };
}

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

describe('markets ranking', () => {
  it('orders highest FDV first with address tie-break', () => {
    const ranked = rankMarketsByFdv([
      { tokenAddress: '0xbbb', fdvUsdX18: '100' },
      { tokenAddress: '0xaaa', fdvUsdX18: '100' },
      { tokenAddress: '0xccc', fdvUsdX18: '500' },
    ]);
    expect(ranked.map((m) => m.tokenAddress)).toEqual(['0xccc', '0xaaa', '0xbbb']);
  });

  it('places missing FDV at the bottom and keeps them visible', () => {
    const ranked = rankMarketsByFdv([
      { tokenAddress: '0xmissing', fdvUsdX18: null },
      { tokenAddress: '0xlow', fdvUsdX18: '10' },
      { tokenAddress: '0xempty', fdvUsdX18: '' },
      { tokenAddress: '0xhigh', fdvUsdX18: '99' },
    ]);
    expect(ranked.map((m) => m.tokenAddress)).toEqual([
      '0xhigh',
      '0xlow',
      '0xempty',
      '0xmissing',
    ]);
    expect(hasValidFdv(null)).toBe(false);
    expect(hasValidFdv('')).toBe(false);
    expect(hasValidFdv('0')).toBe(true);
  });

  it('dedupes by token address', () => {
    const ranked = rankMarketsByFdv([
      { tokenAddress: '0xAAA', fdvUsdX18: '1' },
      { tokenAddress: '0xaaa', fdvUsdX18: '9' },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.fdvUsdX18).toBe('9');
  });

  it('compareMarketsByFdvDesc is deterministic', () => {
    const a = { tokenAddress: '0x1', fdvUsdX18: '5' };
    const b = { tokenAddress: '0x2', fdvUsdX18: '5' };
    expect(compareMarketsByFdvDesc(a, b)).toBe(
      '0x1'.localeCompare('0x2'),
    );
  });

  it('ranks more than 500 markets without truncation across the old cap boundary', () => {
    const rows = [
      ...Array.from({ length: 501 }, (_, i) => ({
        tokenAddress: `0x${(i + 1).toString(16).padStart(40, '0')}`,
        fdvUsdX18: String(i + 1),
      })),
      { tokenAddress: `0x${'f'.repeat(40)}`, fdvUsdX18: null },
      // Duplicate of FDV=250 — last write wins, still one row.
      {
        tokenAddress: `0x${(250).toString(16).padStart(40, '0')}`,
        fdvUsdX18: '250',
      },
    ];
    const ranked = rankMarketsByFdv(rows);
    expect(ranked).toHaveLength(502);
    expect(ranked[0]!.fdvUsdX18).toBe('501');
    expect(ranked[500]!.fdvUsdX18).toBe('1');
    expect(ranked[501]!.fdvUsdX18).toBeNull();
    expect(new Set(ranked.map((r) => r.tokenAddress.toLowerCase())).size).toBe(502);
  });
});

describe('buildMarketsBoardItems', () => {
  it('maps quote label, link identity, and FDV fields', () => {
    const items = buildMarketsBoardItems(
      [
        token({
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          name: 'Hello World',
          symbol: 'HELLO',
          fdvUsdX18: '184200000000000000000000',
          fdvUsdDisplay: '184200',
        }),
        token({
          tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          symbol: 'NOFDV',
          fdvUsdX18: null,
          fdvUsdDisplay: null,
        }),
      ],
      catalogue,
    );

    expect(items[0]!.symbol).toBe('HELLO');
    expect(items[0]!.quoteSymbol).toBe('ETH');
    expect(items[0]!.tokenAddress).toBe(
      '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
    expect(items[1]!.fdvUsdDisplay).toBeNull();
    expect(items.map((i: MarketsBoardItem) => i.symbol)).toEqual(['HELLO', 'NOFDV']);
  });
});
