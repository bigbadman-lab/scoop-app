import { describe, expect, it, vi } from 'vitest';
import {
  formatRawAmount,
  formatX18,
  percentOfSupplyBps,
  percentOfSupplyX18,
  clampLimit,
  clampOffset,
} from '../decimal.js';
import { getTokens, getToken, getActiveMarkets } from './tokens.js';
import { getTrades } from './trades.js';
import { getHolders } from './holders.js';
import { assertCandleInterval } from './candles.js';
import { assertRankingType, getRankings } from './rankings.js';
import { getIndexerStatus } from './health.js';
import {
  CANONICAL_QUOTE_CATALOGUE_COUNT,
  SCOOP_CHAIN_ID,
  getPublicQuoteCatalogue,
} from './quotes.js';
import type { Queryable } from '../types.js';

function mockDb(rows: unknown[] = []) {
  const query = vi.fn(async () => ({ rows, rowCount: rows.length, command: 'SELECT' }));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('decimal helpers', () => {
  it('formats raw amounts without float corruption', () => {
    expect(formatRawAmount('1000000000000000000', 18)).toBe('1');
    expect(formatRawAmount('1234567890000000000', 18, 6)).toBe('1.234567');
    expect(formatRawAmount('1', 18)).toBe('0.000000000000000001');
  });

  it('formats x18 and supply percents with bigint math', () => {
    expect(formatX18('1500000000000000000')).toBe('1.5');
    expect(percentOfSupplyBps('250', '10000')).toBe(250);
    expect(percentOfSupplyX18('1', '2')).toBe('500000000000000000');
    expect(percentOfSupplyBps('1', '0')).toBe(0);
  });

  it('never formats tiny non-zero x18 prices as 0', () => {
    // HELLO-like spot: 2031177705 / 1e18 ≈ 2.031e-9
    expect(formatX18('2031177705')).toBe('0.000000002031');
    expect(formatX18('2031177705')).not.toBe('0');
    expect(formatX18(0n)).toBe('0');
    expect(formatX18('1000000000000000')).toBe('0.001'); // normal compact path
  });

  it('clamps limit and offset', () => {
    expect(clampLimit(1000)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(undefined)).toBe(50);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset(12.9)).toBe(12);
  });
});

describe('query validation / SQL mapping', () => {
  it('getTokens applies filter mapping and pagination params', async () => {
    const db = mockDb([]);
    await getTokens(db, {
      chainId: 4663,
      filter: 'soon',
      sort: 'volume24h',
      limit: 200,
      offset: 10,
      newWindowSeconds: 3600,
      soonThresholdBps: 9000,
    });
    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0]!;
    expect(String(sql)).toContain('launch_progress_bps');
    expect(String(sql)).toContain('volume_24h_quote_raw');
    expect(String(sql)).toContain('LIMIT $4 OFFSET $5');
    expect(params).toEqual([4663, 3600, 9000, 100, 10]);
  });

  it('getTokens respects maxLimit for large capped fetches', async () => {
    const db = mockDb([]);
    await getTokens(db, {
      chainId: 4663,
      filter: 'all',
      sort: 'fdv',
      limit: 500,
      maxLimit: 500,
    });
    const [, params] = db.query.mock.calls[0]!;
    expect(params[3]).toBe(500);
  });

  it('getActiveMarkets returns the full chain set without LIMIT/OFFSET', async () => {
    const db = mockDb([]);
    await getActiveMarkets(db, { chainId: 4663 });
    expect(db.query).toHaveBeenCalledOnce();
    const [sql, params] = db.query.mock.calls[0]!;
    expect(String(sql)).toContain('FROM launches l');
    expect(String(sql)).not.toMatch(/\bLIMIT\b/i);
    expect(String(sql)).not.toMatch(/\bOFFSET\b/i);
    expect(params).toEqual([4663, 604800, 8000]);
  });

  it('getTokens defaults to 7-day NEW window', async () => {
    const db = mockDb([]);
    await getTokens(db, { chainId: 4663, filter: 'new', sort: 'newest' });
    const [, params] = db.query.mock.calls[0]!;
    expect(params[1]).toBe(604800);
  });

  it('mapDiscoveryItem formats tiny non-zero quote prices', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        name: 'Hello World',
        symbol: 'HELLO',
        decimals: 18,
        image_uri: '',
        display_image_url: null,
        pool_id: `0x${'c'.repeat(64)}`,
        creator_id: `0x${'d'.repeat(64)}`,
        quote_asset: '0x0000000000000000000000000000000000000000',
        launched_at: 1,
        age_seconds: 200000,
        launch_progress_bps: 100,
        launch_complete: false,
        is_new: true,
        is_soon: false,
        is_bonded: false,
        price_quote_x18: '2031177705',
        price_usd_x18: null,
        fdv_usd_x18: null,
        volume_24h_quote_raw: '0',
        volume_24h_usd_x18: null,
        trade_count_24h: 7,
        buy_count_24h: 2,
        sell_count_24h: 1,
        holder_count_all: 4,
        holder_count_retail: 2,
        last_trade_at: null,
        price_change_24h_bps: -154,
        quote_decimals: 18,
      },
    ]);
    const items = await getTokens(db, { chainId: 4663, filter: 'new' });
    expect(items[0]?.priceQuoteDisplay).toBe('0.000000002031');
    expect(items[0]?.priceQuoteDisplay).not.toBe('0');
  });

  it('getToken normalizes address and maps detail DTO', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        name: 'Hello World',
        symbol: 'HELLO',
        decimals: 18,
        image_uri: '',
        display_image_url:
          'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png',
        description: 'Hello, world. This is a test.',
        twitter: '',
        telegram: '',
        discord: '',
        website: '',
        farcaster: '',
        total_supply_raw: '1000000000000000000000000000',
        deployer_address: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
        factory_address: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
        fee_distributor_address: '0x187e2c017bcc52094a9086abac94dde7b680a988',
        liquidity_locker_address: '0xaa8445659a2424ee1ba33c232ec05569c975193f',
        pool_id: '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
        creator_id: '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
        quote_asset: '0x0000000000000000000000000000000000000000',
        launched_at: 1788686177,
        age_seconds: 100,
        launch_progress_bps: 100,
        launch_complete: false,
        is_new: true,
        is_soon: false,
        is_bonded: false,
        price_quote_x18: '1000000000000000',
        fdv_usd_x18: null,
        volume_24h_quote_raw: '0',
        volume_24h_usd_x18: null,
        trade_count_24h: 1,
        buy_count_24h: 2,
        sell_count_24h: 1,
        holder_count_all: 2,
        holder_count_retail: 1,
        last_trade_at: 1788686177,
        price_change_24h_bps: null,
        sqrt_price_x96: '1',
        tick: 1,
        liquidity_raw: '1',
        price_usd_x18: null,
        quote_usd_x18: null,
        quote_volume_all_time_raw: '0',
        token_volume_all_time_raw: '0',
        trade_count_all_time: 1,
        buy_count_all_time: 1,
        sell_count_all_time: 0,
        initial_token_inventory_raw: null,
        current_token_inventory_raw: null,
        source_block: 55863290,
        pool_fee: 10000,
        currency0: '0x0000000000000000000000000000000000000000',
        currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        tick_spacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
        creator_eth_raw: '500000000000000000',
        buyback_eth_raw: '0',
      },
    ]);
    const token = await getToken(
      db,
      4663,
      '0x2284Ed0e4d446C6d78ac2d49A68baE822fD87373',
    );
    expect(token?.name).toBe('Hello World');
    expect(token?.symbol).toBe('HELLO');
    expect(token?.poolId).toBe(
      '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
    );
    expect(token?.isNew).toBe(true);
    expect(token?.priceQuoteDisplay).toBe('0.001');
    expect(token?.displayImageUrl).toBe(
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png',
    );
    expect(token?.imageUri).toBe('');
    expect(token?.poolFee).toBe(10000);
    expect(token?.tickSpacing).toBe(10);
    expect(token?.currency0).toBe('0x0000000000000000000000000000000000000000');
    expect(token?.currency1).toBe('0x2284ed0e4d446c6d78ac2d49a68bae822fd87373');
    expect(token?.hooks).toBe('0x0000000000000000000000000000000000000000');
    expect(token?.creatorFeesLifetimeEthDisplay).toBe('0.5');
    expect(token?.buybackFeesLifetimeEthRaw).toBe('0');
    expect(token?.buybackFeesLifetimeEthDisplay).toBe('0');
  });

  it('getTrades left-joins confirmation_status and keeps attribution type', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        tx_hash: `0x${'a'.repeat(64)}`,
        log_index: 1,
        block_number: 10,
        block_timestamp: 100,
        token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        pool_id: `0x${'b'.repeat(64)}`,
        side: 'buy',
        swap_sender: '0x1111111111111111111111111111111111111111',
        tx_from: '0x2222222222222222222222222222222222222222',
        trader_address: null,
        trader_attribution_type: 'tx_from',
        quote_amount_raw: '1000',
        token_amount_raw: '2000',
        execution_price_quote_x18: '500000000000000000',
        quote_usd_x18: null,
        execution_price_usd_x18: null,
        usd_value_x18: null,
        is_initial_buy: true,
        confirmation_status: 'pending',
      },
    ]);
    const items = await getTrades(db, 4663, '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373', {
      limit: 10,
    });
    const [sql] = db.query.mock.calls[0]!;
    expect(String(sql)).toContain('LEFT JOIN raw_chain_events');
    expect(items[0]?.traderAttributionType).toBe('tx_from');
    expect(items[0]?.confirmationStatus).toBe('pending');
  });

  it('getHolders computes supply percent as bps and x18', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        holder_address: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
        balance_raw: '250',
        holder_class: 'user',
        is_system_address: false,
        first_seen_block: 1,
        last_updated_block: 2,
        decimals: 18,
        total_supply_raw: '10000',
      },
    ]);
    const items = await getHolders(db, 4663, '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373', {
      retailOnly: true,
    });
    expect(items[0]?.percentOfSupplyBps).toBe(250);
    expect(items[0]?.percentOfSupplyX18).toBe('25000000000000000');
    const [sql] = db.query.mock.calls[0]!;
    expect(String(sql)).toContain("holder_class = 'user'");
  });

  it('assertCandleInterval and assertRankingType reject unknowns', () => {
    expect(() => assertCandleInterval('2m')).toThrow(/interval/);
    expect(assertCandleInterval('5s')).toBe('5s');
    expect(assertCandleInterval('1m')).toBe('1m');
    expect(() => assertRankingType('foo')).toThrow(/ranking/);
    expect(assertRankingType('volume24h')).toBe('volume24h');
  });

  it('getRankings maps ranks', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        name: 'Hello World',
        symbol: 'HELLO',
        decimals: 18,
        image_uri: '',
        display_image_url: null,
        pool_id: `0x${'c'.repeat(64)}`,
        creator_id: `0x${'d'.repeat(64)}`,
        quote_asset: '0x0000000000000000000000000000000000000000',
        launched_at: 1,
        age_seconds: 1,
        launch_progress_bps: 0,
        launch_complete: false,
        is_new: true,
        is_soon: false,
        is_bonded: false,
        price_quote_x18: null,
        fdv_usd_x18: null,
        volume_24h_quote_raw: '5',
        volume_24h_usd_x18: null,
        trade_count_24h: 1,
        buy_count_24h: 2,
        sell_count_24h: 1,
        holder_count_all: 1,
        holder_count_retail: 1,
        last_trade_at: null,
        price_change_24h_bps: null,
        metric_raw: '5',
      },
    ]);
    const rankings = await getRankings(db, 4663, 'volume24h', { limit: 5 });
    expect(rankings[0]?.rank).toBe(1);
    expect(rankings[0]?.type).toBe('volume24h');
  });

  it('getIndexerStatus derives healthy from target lag and exposes latest/safe lags', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        heartbeat_at: new Date(),
        latest_indexed_block: '1000',
        chain_latest: '7000',
        chain_safe: '1200',
        chain_finalized: '1100',
        // target lag near 0 while latest is far ahead (fixed-lag caught up)
        lag_blocks: '2',
        last_rpc_ok_at: new Date(),
        reorg_count: '0',
        dirty_projections: false,
        watchlist_size: 1,
        active_rpc: 'primary',
        ws_connected: false,
        notes: 'confirmMode=fixed-lag targetHead=1002',
      },
    ]);
    const status = await getIndexerStatus(db, 4663);
    expect(status?.healthy).toBe(true);
    expect(status?.lagBlocks).toBe(2);
    expect(status?.latestLagBlocks).toBe(6000);
    expect(status?.safeLagBlocks).toBe(5800);
  });

  it('canonical quote catalogue count is 22', () => {
    expect(CANONICAL_QUOTE_CATALOGUE_COUNT).toBe(22);
    expect(SCOOP_CHAIN_ID).toBe(4663);
  });

  it('getPublicQuoteCatalogue filters chain/registered/enabled and orders by sort_order', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        quote_asset: '0x0000000000000000000000000000000000000000',
        quote_type: 'native',
        symbol: 'ETH',
        display_symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        category: 'native',
        image_url: null,
        source_name: 'protocol',
        sort_order: 1,
        is_registered: true,
        is_enabled: true,
      },
      {
        chain_id: 4663,
        quote_asset: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
        quote_type: 'scoop',
        symbol: 'USDG',
        display_symbol: 'USDG',
        name: 'Global Dollar',
        decimals: 6,
        category: 'stablecoin',
        image_url: null,
        source_name: 'protocol',
        sort_order: 2,
        is_registered: true,
        is_enabled: true,
      },
    ]);

    const rows = await getPublicQuoteCatalogue(db);
    const [sql, params] = db.query.mock.calls[0]!;

    expect(String(sql)).toContain('FROM public_quote_catalogue');
    expect(String(sql)).toContain('ORDER BY sort_order ASC');
    expect(String(sql)).toContain('is_registered = TRUE');
    expect(String(sql)).toContain('is_enabled = TRUE');
    expect(params).toEqual([4663, true]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.symbol).toBe('ETH');
    expect(rows[0]?.category).toBe('native');
    expect(rows[0]?.imageUrl).toBeNull();
    expect(rows[0]?.displaySymbol).toBe('ETH');
    expect(rows[0]?.sortOrder).toBe(1);
    expect(rows[1]?.symbol).toBe('USDG');
    expect(rows[1]?.quoteType).toBe('scoop');
    expect(rows[1]?.imageUrl).toBeNull();
  });

  it('getPublicQuoteCatalogue keeps nullable imageUrl null-safe', async () => {
    const db = mockDb([
      {
        chain_id: 4663,
        quote_asset: '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9',
        quote_type: 'stock',
        symbol: 'AAPL',
        display_symbol: 'AAPL',
        name: 'Apple',
        decimals: 18,
        category: 'stock',
        image_url: 'https://cdn.robinhood.com/ncw_assets/logos/aapl.png',
        source_name: 'robinhood',
        sort_order: 3,
        is_registered: true,
        is_enabled: true,
      },
    ]);
    const rows = await getPublicQuoteCatalogue(db, { chainId: 4663, enabledOnly: true });
    expect(rows[0]?.imageUrl).toContain('cdn.robinhood.com');
    expect(rows[0]?.category).toBe('stock');
  });
});
