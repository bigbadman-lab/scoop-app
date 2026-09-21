import { describe, expect, it, vi } from 'vitest';
import {
  refreshPumpMarketStateFromTrades,
  updatePumpHolderCount,
} from './pump-market-state.js';
import type { Queryable } from '../types.js';

function mockDb(handler: (sql: string, params: unknown[]) => unknown) {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => handler(sql, params)),
  } as unknown as Queryable;
}

describe('updatePumpHolderCount', () => {
  it('writes only holder fields', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = mockDb((sql, params) => {
      calls.push({ sql, params });
      if (/SELECT \* FROM pump_market_state/.test(sql)) {
        return {
          rows: [
            {
              mint: 'MintA',
              price_sol: '0.01',
              fdv_sol: '100',
              volume_24h_sol: '2',
              trade_count_24h: 5,
              buy_count_24h: 3,
              sell_count_24h: 2,
              last_trade_signature: 'sig',
              last_trade_slot: '9',
              last_trade_at: new Date('2026-09-21T12:00:00Z'),
              last_event_cursor: null,
              holder_count: 7,
              holders_updated_at: new Date('2026-09-21T12:05:00Z'),
              updated_at: new Date('2026-09-21T12:05:00Z'),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const state = await updatePumpHolderCount(db, {
      mint: 'MintA',
      holderCount: 7,
      holdersUpdatedAt: new Date('2026-09-21T12:05:00Z'),
    });

    expect(state.holderCount).toBe(7);
    expect(state.priceSol).toBe('0.01');
    expect(state.tradeCount24h).toBe(5);
    const write = calls.find((c) => /holder_count/.test(c.sql) && /INSERT/.test(c.sql));
    expect(write?.sql).toMatch(/holder_count/);
    expect(write?.sql).not.toMatch(/price_sol = EXCLUDED\.price_sol/);
    expect(write?.params[2]).toBe(7);
  });
});

describe('refreshPumpMarketStateFromTrades holder safety', () => {
  it('does not overwrite holder_count in trade refresh upsert', async () => {
    const db = mockDb((sql) => {
      if (/SELECT \* FROM pump_market_state/.test(sql)) {
        return {
          rows: [
            {
              mint: 'MintA',
              price_sol: '0.02',
              fdv_sol: null,
              volume_24h_sol: '1',
              trade_count_24h: 1,
              buy_count_24h: 1,
              sell_count_24h: 0,
              last_trade_signature: 'sig2',
              last_trade_slot: '10',
              last_trade_at: new Date('2026-09-21T13:00:00Z'),
              last_event_cursor: null,
              holder_count: 7,
              holders_updated_at: new Date('2026-09-21T12:05:00Z'),
              updated_at: new Date('2026-09-21T13:00:00Z'),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const state = await refreshPumpMarketStateFromTrades(db, {
      mint: 'MintA',
      priceSol: '0.02',
      fdvSol: null,
      lastTradeSignature: 'sig2',
      lastTradeSlot: 10,
      lastTradeAt: new Date('2026-09-21T13:00:00Z'),
    });

    const sql = String((db.query as ReturnType<typeof vi.fn>).mock.calls[0]![0]);
    expect(sql).toMatch(/ON CONFLICT/);
    expect(sql).not.toMatch(/holder_count/);
    expect(state.holderCount).toBe(7);
    expect(state.priceSol).toBe('0.02');
  });
});
