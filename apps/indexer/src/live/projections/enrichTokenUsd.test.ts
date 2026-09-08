import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import {
  enrichTokenHistoricalUsd,
  parseTradeTimestampSec,
} from './enrichTokenUsd.js';

describe('parseTradeTimestampSec', () => {
  it('parses unix seconds and ISO', () => {
    expect(parseTradeTimestampSec(1_700_000_000)).toBe(1_700_000_000);
    expect(parseTradeTimestampSec('1700000000')).toBe(1_700_000_000);
    expect(parseTradeTimestampSec('2023-11-14T22:13:20.000Z')).toBe(1_700_000_000);
  });
});

describe('enrichTokenHistoricalUsd', () => {
  it('dry-run counts enrichment without writing trades/candles/checkpoints', async () => {
    const tradeTs = 1_700_000_100;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM launches')) {
        return {
          rows: [
            {
              pool_id: '0x' + '11'.repeat(32),
              quote_asset: ZERO_ADDRESS,
              tick_lower: -100,
              tick_upper: 100,
              opening_sqrt_price_x96: '1000000000000000000000000',
            },
          ],
        };
      }
      if (sql.includes('FROM quote_assets')) {
        return { rows: [{ decimals: 18 }] };
      }
      if (sql.includes('FROM trades') && sql.includes('ORDER BY block_number ASC')) {
        return {
          rows: [
            {
              tx_hash: '0x' + 'aa'.repeat(32),
              log_index: 0,
              block_number: '55863290',
              block_timestamp: String(tradeTs),
              pool_id: '0x' + '11'.repeat(32),
              quote_asset: ZERO_ADDRESS,
              side: 'buy',
              quote_amount_raw: (1n * 10n ** 18n).toString(),
              token_amount_raw: (1000n * 10n ** 18n).toString(),
              execution_price_quote_x18: (10n ** 15n).toString(),
              sqrt_price_x96_after: '1000000000000000000000000',
              tick_after: 0,
              liquidity_after_raw: '1000',
              quote_usd_x18: null,
              execution_price_usd_x18: null,
              usd_value_x18: null,
            },
            {
              tx_hash: '0x' + 'bb'.repeat(32),
              log_index: 1,
              block_number: '55863291',
              block_timestamp: String(tradeTs - 10_000), // predates available snapshot
              pool_id: '0x' + '11'.repeat(32),
              quote_asset: ZERO_ADDRESS,
              side: 'sell',
              quote_amount_raw: (1n * 10n ** 18n).toString(),
              token_amount_raw: (1000n * 10n ** 18n).toString(),
              execution_price_quote_x18: (10n ** 15n).toString(),
              sqrt_price_x96_after: '1000000000000000000000000',
              tick_after: 0,
              liquidity_after_raw: '1000',
              quote_usd_x18: null,
              execution_price_usd_x18: null,
              usd_value_x18: null,
            },
          ],
        };
      }
      if (sql.includes('quote_price_snapshots')) {
        const atOrBefore = Number(params?.[2] ?? 0);
        // Simulate snapshot coverage starting at tradeTs only.
        if (!Number.isFinite(atOrBefore) || atOrBefore < tradeTs) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              price_usd_x18: (3000n * 10n ** 18n).toString(),
              observed_at: new Date(tradeTs * 1000),
              decimals: 18,
              oracle_max_age: 86400,
            },
          ],
        };
      }
      if (sql.includes('FROM token_market_state')) {
        return { rows: [{ volume_24h_usd_x18: null, last_trade_at: String(tradeTs) }] };
      }
      return { rows: [] };
    });

    const report = await enrichTokenHistoricalUsd(
      { query } as never,
      {
        chainId: 4663,
        tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        quoteUsdMaxAgeSeconds: 300,
        dryRun: true,
        log: () => undefined,
      },
    );

    expect(report.dryRun).toBe(true);
    expect(report.checkpointTouched).toBe(false);
    expect(report.tradesFound).toBe(2);
    expect(report.tradesEnriched).toBe(1);
    expect(report.tradesMissingSnapshot).toBe(1);
    expect(report.candlesRebuilt).toBe(false);
    expect(report.blockRange).toEqual({ min: 55863290, max: 55863291 });

    const writes = query.mock.calls.filter(
      ([sql]) =>
        typeof sql === 'string' &&
        (sql.includes('UPDATE trades') ||
          sql.includes('DELETE FROM candles') ||
          sql.includes('indexer_checkpoints')),
    );
    expect(writes).toHaveLength(0);
  });

  it('execute path updates trade USD fields and deletes/rebuilds candles', async () => {
    const tradeTs = 1_700_000_100;
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes('FROM launches')) {
        return {
          rows: [
            {
              pool_id: '0x' + '11'.repeat(32),
              quote_asset: ZERO_ADDRESS,
              tick_lower: -100,
              tick_upper: 100,
              opening_sqrt_price_x96: '1000000000000000000000000',
            },
          ],
        };
      }
      if (sql.includes('FROM quote_assets')) {
        return { rows: [{ decimals: 18 }] };
      }
      if (sql.includes('FROM trades') && sql.includes('ORDER BY block_number ASC')) {
        return {
          rows: [
            {
              tx_hash: '0x' + 'aa'.repeat(32),
              log_index: 0,
              block_number: '55863290',
              block_timestamp: String(tradeTs),
              pool_id: '0x' + '11'.repeat(32),
              quote_asset: ZERO_ADDRESS,
              side: 'buy',
              quote_amount_raw: (1n * 10n ** 18n).toString(),
              token_amount_raw: (1000n * 10n ** 18n).toString(),
              execution_price_quote_x18: (10n ** 15n).toString(),
              sqrt_price_x96_after: '1000000000000000000000000',
              tick_after: 0,
              liquidity_after_raw: '1000',
              quote_usd_x18: null,
              execution_price_usd_x18: null,
              usd_value_x18: null,
            },
          ],
        };
      }
      if (sql.includes('quote_price_snapshots')) {
        return {
          rows: [
            {
              price_usd_x18: (3000n * 10n ** 18n).toString(),
              observed_at: new Date(tradeTs * 1000),
              decimals: 18,
              oracle_max_age: 86400,
            },
          ],
        };
      }
      if (sql.includes('FROM tokens') || sql.includes('JOIN tokens')) {
        return {
          rows: [
            {
              quote_asset: ZERO_ADDRESS,
              token_decimals: 18,
              total_supply_raw: (1_000_000n * 10n ** 18n).toString(),
              quote_decimals: 18,
            },
          ],
        };
      }
      if (sql.includes('COUNT(*)') && sql.includes('FROM trades')) {
        return {
          rows: [
            {
              trade_count: '1',
              buy_count: '1',
              sell_count: '0',
              quote_volume: (1n * 10n ** 18n).toString(),
              token_volume: (1000n * 10n ** 18n).toString(),
              last_trade_at: String(tradeTs),
              last_trade_block: '55863290',
              usd_volume: (3000n * 10n ** 18n).toString(),
              usd_valued_count: '1',
              first_price: (10n ** 15n).toString(),
              last_price: (10n ** 15n).toString(),
            },
          ],
        };
      }
      if (sql.includes('FROM holder_balances')) {
        return { rows: [{ all_count: '1', retail_count: '1' }] };
      }
      if (sql.includes('initial_token_inventory_raw')) {
        return { rows: [{ initial_token_inventory_raw: null }] };
      }
      if (sql.includes('FROM token_market_state')) {
        return {
          rows: [
            {
              volume_24h_usd_x18: (3000n * 10n ** 18n).toString(),
              last_trade_at: String(tradeTs),
            },
          ],
        };
      }
      if (sql.includes('FROM candles')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const report = await enrichTokenHistoricalUsd(
      { query } as never,
      {
        chainId: 4663,
        tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        quoteUsdMaxAgeSeconds: 300,
        dryRun: false,
        log: () => undefined,
      },
    );

    expect(report.tradesEnriched).toBe(1);
    expect(report.candlesRebuilt).toBe(true);
    expect(report.checkpointTouched).toBe(false);
    expect(statements.some((s) => s.includes('UPDATE trades'))).toBe(true);
    expect(statements.some((s) => s.includes('DELETE FROM candles'))).toBe(true);
    expect(statements.some((s) => s.includes('indexer_checkpoints'))).toBe(false);
  });
});
