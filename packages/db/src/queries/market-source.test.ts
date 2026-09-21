import { describe, expect, it, vi } from 'vitest';
import { mapDiscoveryItem, type DiscoverySqlRow } from './_discoverySql.js';

function scoopRow(over?: Partial<DiscoverySqlRow>): DiscoverySqlRow {
  return {
    chain_id: 4663,
    token_address: '0x5806a32ad9b52b39d1836d18a6c16328105abda2',
    name: 'Example',
    symbol: 'EXMPL',
    decimals: 18,
    image_uri: 'ipfs://x',
    display_image_url: null,
    market_source: 'scoop',
    graduation_status: null,
    pool_id: '0x' + '11'.repeat(32),
    curve_address: null,
    creator_id: '0x' + '22'.repeat(32),
    quote_asset: '0x0000000000000000000000000000000000000000',
    launched_at: 1_700_000_000,
    age_seconds: 100,
    launch_progress_bps: 0,
    launch_complete: false,
    is_new: true,
    is_soon: false,
    is_bonded: false,
    price_quote_x18: '1000000000000000000',
    price_usd_x18: '2000000000000000000',
    fdv_usd_x18: '3000000000000000000',
    volume_24h_quote_raw: '1000',
    volume_24h_usd_x18: '4000000000000000000',
    trade_count_24h: 1,
    trade_count_all_time: 1,
    buy_count_24h: 1,
    sell_count_24h: 0,
    holder_count_all: 1,
    holder_count_retail: 1,
    last_trade_at: null,
    price_change_24h_bps: null,
    quote_decimals: 18,
    lore_title: null,
    ...over,
  };
}

describe('discovery marketSource mapping (Gate 6)', () => {
  it('defaults missing source to scoop and keeps USD metrics', () => {
    const item = mapDiscoveryItem(scoopRow({ market_source: null }));
    expect(item.marketSource).toBe('scoop');
    expect(item.marketPhase).toBeNull();
    expect(item.fdvUsdX18).toBe('3000000000000000000');
    expect(item.poolId).toBeTruthy();
  });

  it('maps pons_v2 and exposes FDV/USD from token market state', () => {
    const item = mapDiscoveryItem(
      scoopRow({
        market_source: 'pons_v2',
        graduation_status: 'curve',
        pool_id: null,
        curve_address: '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0',
      }),
    );
    expect(item.marketSource).toBe('pons_v2');
    expect(item.marketPhase).toBe('curve');
    expect(item.poolId).toBeNull();
    expect(item.curveAddress).toBe('0xde0e7e06e54003d112eec210e5ddf727317cb6b0');
    expect(item.fdvUsdX18).toBe('3000000000000000000');
    expect(item.priceUsdX18).toBe('2000000000000000000');
    expect(item.volume24hUsdX18).toBe('4000000000000000000');
    // Quote volume still exposed from raw trades
    expect(item.volume24hQuoteRaw).toBe('1000');
  });

  it('still withholds Pump TMS USD (dual-rail overlay owns Pump USD)', () => {
    const item = mapDiscoveryItem(
      scoopRow({
        market_source: 'pump',
        pool_id: null,
      }),
    );
    expect(item.marketSource).toBe('pump');
    expect(item.fdvUsdX18).toBeNull();
    expect(item.priceUsdX18).toBeNull();
    expect(item.volume24hUsdX18).toBeNull();
  });
});

describe('getLaunchMarketReady pons readiness', () => {
  it('returns pons_v2 ready without UV4 pool', async () => {
    const { getLaunchMarketReady } = await import('./launch-market-ready.js');
    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            chain_id: 4663,
            token_address: '0x5806a32ad9b52b39d1836d18a6c16328105abda2',
            launch_tx_hash: '0x' + 'aa'.repeat(32),
            creator_id: '0x' + 'bb'.repeat(32),
            quote_asset: '0x0000000000000000000000000000000000000000',
            deployer_address: '0x5fd466ba9576527974fec62cf96d058fc667f70f',
            pool_id: null,
            fee_distributor_address: null,
            liquidity_locker_address: null,
            name: 'Pons',
            symbol: 'PONS',
            market_source: 'pons_v2',
            graduation_status: 'curve',
            curve_address: '0xde0e7e06e54003d112eec210e5ddf727317cb6b0',
          },
        ],
      })),
    };
    const ready = await getLaunchMarketReady(
      db as never,
      4663,
      '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2',
    );
    expect(ready?.marketSource).toBe('pons_v2');
    expect(ready?.poolId).toBeNull();
    expect(ready?.curveAddress).toBeTruthy();
    expect(ready?.name).toBe('Pons');
  });
});
