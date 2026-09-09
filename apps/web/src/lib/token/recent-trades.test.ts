import { describe, expect, it } from 'vitest';
import type { TradeItem } from '@scoop/db';
import {
  RECENT_TRADES_VISIBLE_CAP,
  boundRecentTrades,
  formatTradeAccountDisplay,
  formatTradeAge,
  formatTradeExecutionPrice,
  formatTradeSideLabel,
  formatTradeUsdValue,
  mergeRecentTradesNewestFirst,
  resolveTradeAccount,
  tradeIdentity,
} from '@/lib/token/recent-trades';
import { robinhoodTxUrl } from '@/lib/chain/explorer';

import { helloTradesNewestFirst } from '@/lib/token/hello-trades.fixture';


describe('recent-trades helpers', () => {
  it('keeps HELLO newest-first BUY/SELL sequence without reversing', () => {
    const items = helloTradesNewestFirst();
    expect(items).toHaveLength(7);
    expect(items.map((t) => formatTradeSideLabel(String(t.side)))).toEqual([
      'SELL',
      'BUY',
      'SELL',
      'BUY',
      'SELL',
      'BUY',
      'BUY',
    ]);
    expect(boundRecentTrades(items)).toHaveLength(7);
    expect(boundRecentTrades(items)[0]!.blockTimestamp).toBe(1788713806);
    expect(boundRecentTrades(items)[6]!.isInitialBuy).toBe(true);
  });

  it('formats USD price, quote-only price, null USD, and account', () => {
    const [newest] = helloTradesNewestFirst();
    expect(formatTradeExecutionPrice(newest!, 'ETH')).toBe('$0.000004981');
    expect(formatTradeUsdValue(newest!)).toBe('$0.485');

    const quoteOnly: TradeItem = {
      ...newest!,
      executionPriceUsdX18: null,
      executionPriceUsdDisplay: null,
      usdValueX18: null,
      usdValueDisplay: null,
    };
    expect(formatTradeExecutionPrice(quoteOnly, 'ETH')).toBe('0.000000002009 ETH');
    expect(formatTradeUsdValue(quoteOnly)).toBe('—');

    expect(formatTradeAccountDisplay('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toMatch(
      /^0xbbbb…bbbb$/i,
    );
    expect(resolveTradeAccount({ ...newest!, traderAddress: null, txFrom: '0xabc' })).toBe(
      '0xabc',
    );
    expect(resolveTradeAccount({ ...newest!, traderAddress: null, txFrom: null })).toBeNull();
  });

  it('formats compact trade age and explorer tx url', () => {
    expect(formatTradeAge(1_000, 1_012)).toBe('12s');
    expect(formatTradeAge(1_000, 1_000 + 120)).toBe('2m');
    expect(
      robinhoodTxUrl('0x7777777777777777777777777777777777777777777777777777777777777777'),
    ).toBe(
      'https://explorer.mainnet.chain.robinhood.com/tx/0x7777777777777777777777777777777777777777777777777777777777777777',
    );
  });

  it('bounds visible rows and merges/dedupes for future live prepend', () => {
    const many = helloTradesNewestFirst();
    while (many.length < 30) {
      const i = many.length + 1;
      many.unshift({
        ...many[0]!,
        logIndex: 1000 + i,
        blockTimestamp: many[0]!.blockTimestamp + i,
        txHash: `0x${i.toString(16).padStart(64, 'a')}`,
      });
    }
    expect(many.length).toBeGreaterThan(RECENT_TRADES_VISIBLE_CAP);
    expect(boundRecentTrades(many)).toHaveLength(RECENT_TRADES_VISIBLE_CAP);

    const existing = helloTradesNewestFirst().slice(0, 3);
    const newer: TradeItem = {
      ...existing[0]!,
      logIndex: 999,
      blockTimestamp: existing[0]!.blockTimestamp + 10,
      txHash: `0x${'c'.repeat(64)}`,
      side: 'buy',
    };
    const dup = { ...existing[0]! };
    const merged = mergeRecentTradesNewestFirst(existing, [newer, dup], 20);
    expect(merged[0]!).toBe(newer);
    expect(merged.filter((t) => tradeIdentity(t) === tradeIdentity(dup))).toHaveLength(1);
    expect(merged).toHaveLength(4);
  });
});
