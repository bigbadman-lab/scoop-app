import { describe, expect, it, vi } from 'vitest';
import { getProtocolStats } from './protocol-stats.js';
import type { Queryable } from '../types.js';

function mockDb(handler: (sql: string, params: unknown[]) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params));
  return { query } as unknown as Queryable & { query: ReturnType<typeof vi.fn> };
}

describe('getProtocolStats', () => {
  it('aggregates markets, trades, volume and excludes canaries in SQL', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('COUNT(*)::text AS markets_count')) {
        expect(sql).toMatch(/NOT IN/i);
        expect(sql).toMatch(/0x48f91579d27d044681098eb4e5b4b92b3f83ef7d/);
        return { rows: [{ markets_count: '2' }] };
      }
      if (sql.includes('COUNT(*)::text AS trades_count')) {
        return { rows: [{ trades_count: '10' }] };
      }
      if (sql.includes('volume_usd_x18')) {
        return {
          rows: [
            {
              volume_usd_x18: '1500000000000000000000', // $1500
              trades_missing_usd: '1',
            },
          ],
        };
      }
      if (sql.includes('fee_distributions')) {
        return {
          rows: [
            {
              asset_kind: 'eth',
              asset_address: '0x0000000000000000000000000000000000000000',
              fees_raw: '1000000000000000000', // 1 ETH fees
              buyback_raw: '200000000000000000', // 0.2 ETH buyback
            },
          ],
        };
      }
      if (sql.includes('quote_price_snapshots')) {
        return {
          rows: [
            {
              quote_asset: '0x0000000000000000000000000000000000000000',
              price_usd_x18: '2000000000000000000000', // $2000/ETH
              decimals: 18,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const stats = await getProtocolStats(db, 4663);
    expect(stats.marketsLaunched).toBe(2);
    expect(stats.totalTrades).toBe(10);
    expect(stats.totalVolumeUsd).toBe('1500');
    expect(stats.tradesMissingUsd).toBe(1);
    expect(stats.feeSemantics).toBe('distributed_marked_to_market');
    expect(stats.feeCoverage).toBe('complete');
    // 1 ETH * $2000 = $2000 fees; 0.2 ETH * $2000 = $400 buyback
    expect(stats.totalFeesUsd).toBe('2000');
    expect(stats.protocolBuybackFeesUsd).toBe('400');
    expect(stats.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('handles empty database', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('markets_count')) return { rows: [{ markets_count: '0' }] };
      if (sql.includes('trades_count')) return { rows: [{ trades_count: '0' }] };
      if (sql.includes('volume_usd_x18')) {
        return { rows: [{ volume_usd_x18: null, trades_missing_usd: '0' }] };
      }
      if (sql.includes('fee_distributions')) return { rows: [] };
      return { rows: [] };
    });

    const stats = await getProtocolStats(db, 4663);
    expect(stats.marketsLaunched).toBe(0);
    expect(stats.totalTrades).toBe(0);
    expect(stats.totalVolumeUsd).toBeNull();
    expect(stats.feeCoverage).toBe('empty');
    expect(stats.totalFeesUsd).toBe('0');
    expect(stats.protocolBuybackFeesUsd).toBe('0');
  });

  it('marks fee coverage unavailable when prices are missing', async () => {
    const db = mockDb((sql) => {
      if (sql.includes('markets_count')) return { rows: [{ markets_count: '1' }] };
      if (sql.includes('trades_count')) return { rows: [{ trades_count: '1' }] };
      if (sql.includes('volume_usd_x18')) {
        return { rows: [{ volume_usd_x18: '0', trades_missing_usd: '0' }] };
      }
      if (sql.includes('fee_distributions')) {
        return {
          rows: [
            {
              asset_kind: 'token',
              asset_address: '0x1111111111111111111111111111111111111111',
              fees_raw: '1000',
              buyback_raw: '200',
            },
          ],
        };
      }
      // no prices
      return { rows: [] };
    });

    const stats = await getProtocolStats(db, 4663);
    expect(stats.feeCoverage).toBe('unavailable');
    expect(stats.totalFeesUsd).toBeNull();
    expect(stats.protocolBuybackFeesUsd).toBeNull();
  });
});
