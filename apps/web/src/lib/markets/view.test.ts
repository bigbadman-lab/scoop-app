import { describe, expect, it } from 'vitest';
import type { MarketsBoardItem } from '@/lib/markets/types';
import {
  applyMarketsBoardView,
  filterMarketsBoardItems,
  formatMarketsFeedUpdatedAt,
  marketsViewLeaderId,
  sortMarketsBoardItems,
} from '@/lib/markets/view';

function market(
  partial: Partial<MarketsBoardItem> & Pick<MarketsBoardItem, 'tokenAddress'>,
): MarketsBoardItem {
  return {
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
    tradeCountAllTime: 10,
    tradeCount24h: 1,
    holderCountAll: 5,
    holderCountRetail: 4,
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
  }),
  market({
    tokenAddress: '0xbbb',
    name: 'Coinbase',
    symbol: 'COIN',
    launchedAt: 300,
    tradeCountAllTime: 50,
    fdvUsdX18: '200',
  }),
  market({
    tokenAddress: '0xccc',
    name: 'Hello World',
    symbol: 'HELLO',
    launchedAt: 200,
    tradeCountAllTime: null,
    fdvUsdX18: '100',
  }),
];

describe('sortMarketsBoardItems', () => {
  it('Trending preserves incoming order', () => {
    expect(sortMarketsBoardItems(sample, 'trending').map((m) => m.tokenAddress)).toEqual([
      '0xaaa',
      '0xbbb',
      '0xccc',
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
});

describe('marketsViewLeaderId', () => {
  it('returns the #1 token for the active sort', () => {
    expect(marketsViewLeaderId(sample, 'trending')).toBe('0xaaa');
    expect(marketsViewLeaderId(sample, 'newest')).toBe('0xbbb');
    expect(marketsViewLeaderId(sample, 'trades')).toBe('0xbbb');
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
