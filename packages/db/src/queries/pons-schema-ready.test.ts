import { describe, expect, it, vi } from 'vitest';
import { checkPonsMarketSchemaReady } from './pons-schema-ready.js';

describe('checkPonsMarketSchemaReady', () => {
  it('returns ready when both columns exist', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { column_name: 'market_source' },
          { column_name: 'curve_address' },
        ],
      }),
    };
    const r = await checkPonsMarketSchemaReady(db as never);
    expect(r.ready).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('fails closed when columns missing', async () => {
    const db = {
      query: vi.fn().mockResolvedValue({
        rows: [{ column_name: 'market_source' }],
      }),
    };
    const r = await checkPonsMarketSchemaReady(db as never);
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY');
  });

  it('fails closed on query error', async () => {
    const db = {
      query: vi.fn().mockRejectedValue(new Error('no relation')),
    };
    const r = await checkPonsMarketSchemaReady(db as never);
    expect(r.ready).toBe(false);
  });
});
