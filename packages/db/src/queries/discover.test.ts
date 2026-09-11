import { describe, expect, it, vi } from 'vitest';
import {
  DISCOVER_TAB_LIMIT,
  DISCOVER_TRENDING_MIN_TRADES_24H,
  getDiscoverBoard,
  getDiscoverTrending,
} from './discover.js';
import { getTokens } from './tokens.js';

function mockDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async () => ({ rows })),
  };
}

function discoveryRow(overrides: Record<string, unknown> = {}) {
  return {
    chain_id: 4663,
    token_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'A',
    symbol: 'A',
    decimals: 18,
    image_uri: '',
    display_image_url: null,
    pool_id: '0xpool',
    creator_id: '0x1111111111111111111111111111111111111111',
    quote_asset: '0x0000000000000000000000000000000000000000',
    launched_at: 1_700_000_000,
    age_seconds: 100,
    launch_progress_bps: 8500,
    launch_complete: false,
    is_new: true,
    is_soon: true,
    is_bonded: false,
    price_quote_x18: null,
    price_usd_x18: null,
    fdv_usd_x18: null,
    volume_24h_quote_raw: '1',
    volume_24h_usd_x18: '100',
    trade_count_24h: 5,
    buy_count_24h: 3,
    sell_count_24h: 2,
    holder_count_all: 1,
    holder_count_retail: 1,
    last_trade_at: null,
    price_change_24h_bps: 100,
    quote_decimals: 18,
    ...overrides,
  };
}

describe('getDiscoverTrending', () => {
  it('filters by trade count and positive USD volume with deterministic order', async () => {
    const db = mockDb([]);
    await getDiscoverTrending(db as never, { chainId: 4663 });
    const [sql, params] = db.query.mock.calls[0]!;
    const text = String(sql);
    expect(text).toContain('trade_count_24h');
    expect(text).toContain('volume_24h_usd_x18');
    expect(text).toContain('buy_count_24h');
    expect(text).toMatch(/ORDER BY[\s\S]*volume_24h_usd_x18 DESC[\s\S]*trade_count_24h[\s\S]*buy_count_24h[\s\S]*token_address ASC/i);
    expect(text).not.toMatch(/FROM trades\b/i);
    expect(text).not.toMatch(/price_change_24h_bps DESC/i);
    expect(params).toEqual([
      4663,
      604800,
      8000,
      DISCOVER_TRENDING_MIN_TRADES_24H,
      DISCOVER_TAB_LIMIT,
    ]);
  });

  it('maps buyCount24h from projected state', async () => {
    const db = mockDb([
      discoveryRow({
        token_address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        buy_count_24h: 9,
        sell_count_24h: 4,
        trade_count_24h: 13,
        volume_24h_usd_x18: '500',
      }),
    ]);
    const items = await getDiscoverTrending(db as never, { chainId: 4663 });
    expect(items).toHaveLength(1);
    expect(items[0]!.buyCount24h).toBe(9);
    expect(items[0]!.sellCount24h).toBe(4);
    expect(items[0]!.tradeCount24h).toBe(13);
  });
});

describe('getDiscoverBoard', () => {
  it('runs three bounded queries in parallel (new / soon / trending)', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        const text = String(sql);
        if (text.includes('volume_24h_usd_x18 > 0')) {
          return { rows: [discoveryRow({ token_address: '0xcccccccccccccccccccccccccccccccccccccccc' })] };
        }
        if (text.includes('COALESCE(m.launch_complete, FALSE) = FALSE')) {
          return {
            rows: [
              discoveryRow({
                token_address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                launch_progress_bps: 9000,
              }),
            ],
          };
        }
        return {
          rows: [
            discoveryRow({
              token_address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              launch_progress_bps: 100,
              is_soon: false,
            }),
          ],
        };
      }),
    };

    const board = await getDiscoverBoard(db as never, { chainId: 4663 });
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(board.new).toHaveLength(1);
    expect(board.bonding).toHaveLength(1);
    expect(board.trending).toHaveLength(1);

    for (const call of db.query.mock.calls) {
      const sql = String(call[0]);
      const params = call[1] as unknown[];
      if (sql.includes('volume_24h_usd_x18 > 0')) {
        expect(params[4]).toBe(DISCOVER_TAB_LIMIT);
      } else {
        // getTokens: [chainId, newWindow, soonBps, limit, offset]
        expect(params[3]).toBe(DISCOVER_TAB_LIMIT);
        expect(params[4]).toBe(0);
      }
    }
  });
});

describe('discover ordering helpers via getTokens', () => {
  it('NEW orders by launched_at DESC then token_address ASC', async () => {
    const db = mockDb([]);
    await getTokens(db as never, {
      chainId: 4663,
      filter: 'new',
      sort: 'newest',
      limit: 24,
    });
    const [sql] = db.query.mock.calls[0]!;
    expect(String(sql)).toMatch(
      /ORDER BY l\.launched_at DESC, l\.token_address ASC/,
    );
  });

  it('BONDING (soon) orders by progress DESC, launched_at DESC, address ASC', async () => {
    const db = mockDb([]);
    await getTokens(db as never, {
      chainId: 4663,
      filter: 'soon',
      sort: 'progress',
      limit: 24,
    });
    const [sql] = db.query.mock.calls[0]!;
    expect(String(sql)).toMatch(
      /ORDER BY COALESCE\(m\.launch_progress_bps, 0\) DESC, l\.launched_at DESC, l\.token_address ASC/,
    );
    expect(String(sql)).toContain('launch_complete');
  });
});
