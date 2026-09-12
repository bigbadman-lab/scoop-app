import { describe, expect, it, vi } from 'vitest';
import {
  DISCOVER_TAB_LIMIT,
  DISCOVER_TRENDING_MIN_TRADES_24H,
  getDiscoverBoard,
  getDiscoverBonding,
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
    trade_count_all_time: 5,
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
        trade_count_all_time: 13,
        volume_24h_usd_x18: '500',
      }),
    ]);
    const items = await getDiscoverTrending(db as never, { chainId: 4663 });
    expect(items).toHaveLength(1);
    expect(items[0]!.buyCount24h).toBe(9);
    expect(items[0]!.sellCount24h).toBe(4);
    expect(items[0]!.tradeCount24h).toBe(13);
    expect(items[0]!.tradeCountAllTime).toBe(13);
  });
});

describe('getDiscoverBonding', () => {
  it('selects all incomplete markets with no 80% floor and ranks by progress', async () => {
    const db = mockDb([]);
    await getDiscoverBonding(db as never, { chainId: 4663 });
    const [sql, params] = db.query.mock.calls[0]!;
    const text = String(sql);
    expect(text).toMatch(
      /WHERE l\.chain_id = \$1\s+AND COALESCE\(m\.launch_complete, FALSE\) = FALSE/,
    );
    expect(text).not.toMatch(
      /WHERE[\s\S]*launch_progress_bps[\s\S]*>= \$3[\s\S]*launch_complete/,
    );
    expect(text).toMatch(
      /ORDER BY\s+COALESCE\(m\.launch_progress_bps, 0\) DESC,\s+l\.launched_at DESC,\s+l\.token_address ASC/,
    );
    expect(params).toEqual([4663, 604800, 8000, DISCOVER_TAB_LIMIT]);
  });

  it('includes incomplete markets with no 80% floor (SQL predicate)', async () => {
    const db = mockDb([
      discoveryRow({
        token_address: '0x0000000000000000000000000000000000000001',
        launch_progress_bps: 100,
        launch_complete: false,
      }),
    ]);
    const items = await getDiscoverBonding(db as never, { chainId: 4663 });
    expect(items[0]!.launchProgressBps).toBe(100);
    expect(items[0]!.launchComplete).toBe(false);

    const text = String(db.query.mock.calls[0]![0]);
    // WHERE must not require soon (≥8000) — only incomplete.
    const whereIdx = text.indexOf('WHERE l.chain_id');
    const whereClause = text.slice(whereIdx, text.indexOf('ORDER BY'));
    expect(whereClause).toContain('launch_complete');
    expect(whereClause).not.toContain('launch_progress_bps');
  });

  it('limits to 24', async () => {
    const db = mockDb([]);
    await getDiscoverBonding(db as never, { chainId: 4663, limit: 24 });
    const params = db.query.mock.calls[0]![1] as unknown[];
    expect(params[3]).toBe(24);
  });
});

describe('getDiscoverBoard', () => {
  it('runs three bounded queries in parallel (new / bonding / trending)', async () => {
    const db = {
      query: vi.fn(async (_sql: string, params: unknown[]) => {
        if (params.length === 5 && params[3] === DISCOVER_TRENDING_MIN_TRADES_24H) {
          return { rows: [discoveryRow({ token_address: '0xcccccccccccccccccccccccccccccccccccccccc' })] };
        }
        if (params.length === 4) {
          // getDiscoverBonding
          return {
            rows: [
              discoveryRow({
                token_address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                launch_progress_bps: 500,
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
    expect(board.bonding[0]!.launchProgressBps).toBe(500);
    expect(board.trending).toHaveLength(1);

    const bondingCall = db.query.mock.calls.find((c) => (c[1] as unknown[]).length === 4)!;
    expect(String(bondingCall[0])).not.toMatch(
      /WHERE[\s\S]*launch_progress_bps[\s\S]*>= \$3[\s\S]*AND COALESCE\(m\.launch_complete/,
    );
  });
});

describe('internal soon semantics remain unchanged', () => {
  it('getTokens filter=soon still requires >= 8000 bps and incomplete', async () => {
    const db = mockDb([]);
    await getTokens(db as never, {
      chainId: 4663,
      filter: 'soon',
      sort: 'progress',
      limit: 24,
    });
    const [sql] = db.query.mock.calls[0]!;
    const text = String(sql);
    expect(text).toContain('COALESCE(m.launch_progress_bps, 0) >= $3::INT');
    expect(text).toContain('COALESCE(m.launch_complete, FALSE) = FALSE');
    expect(text).toMatch(
      /ORDER BY COALESCE\(m\.launch_progress_bps, 0\) DESC, l\.launched_at DESC, l\.token_address ASC/,
    );
  });

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
});
