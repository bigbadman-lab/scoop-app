import { describe, expect, it, vi } from 'vitest';
import {
  deleteExternalPumpCanaryMarket,
  getExternalPumpImport,
} from '@scoop/db';

describe('external pump canary removal guards', () => {
  it('deleteExternalPumpCanaryMarket is mint-scoped SQL', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.includes('information_schema')) {
          return { rowCount: 1, rows: [{ '?column?': 1 }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    };
    const mint = '3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump';
    const counts = await deleteExternalPumpCanaryMarket(db as never, mint);
    expect(counts.tokens).toBe(1);
    expect(counts.launches).toBe(1);
    expect(queries.every((q) => q.params.includes(mint) || q.params.length === 0 || q.sql.includes('information_schema'))).toBe(
      true,
    );
    expect(queries.some((q) => /import_kind = 'canary'/.test(q.sql))).toBe(true);
  });

  it('rejects invalid mint', async () => {
    await expect(
      deleteExternalPumpCanaryMarket({ query: vi.fn() } as never, '0xdead'),
    ).rejects.toThrow(/Invalid Solana mint/i);
  });

  it('getExternalPumpImport returns null for unknown mints', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const row = await getExternalPumpImport(
      db as never,
      '3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump',
    );
    expect(row).toBeNull();
  });
});
