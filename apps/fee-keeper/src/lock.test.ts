import { describe, expect, it, vi } from 'vitest';
import {
  FEE_KEEPER_ADVISORY_LOCK_SQL,
  isIndexerLockSql,
  tryAcquireFeeKeeperLock,
} from './lock.js';
import type { Client } from '@scoop/db';

describe('fee keeper lock', () => {
  it('uses scoop_fee_keeper not scoop_indexer', () => {
    expect(FEE_KEEPER_ADVISORY_LOCK_SQL).toContain("hashtext('scoop_fee_keeper')");
    expect(isIndexerLockSql(FEE_KEEPER_ADVISORY_LOCK_SQL)).toBe(false);
    expect(isIndexerLockSql("hashtext('scoop_indexer')")).toBe(true);
  });

  it('returns unavailable when lock not acquired', async () => {
    const end = vi.fn(async () => undefined);
    const client = {
      connect: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ rows: [{ locked: false }] })),
      end,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as Client;

    const result = await tryAcquireFeeKeeperLock({
      databaseUrl: 'postgres://test',
      createLockClient: () => client,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unavailable');
    expect(end).toHaveBeenCalled();
  });

  it('acquires and unlocks with fee-keeper SQL', async () => {
    const queries: string[] = [];
    const client = {
      connect: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('pg_try_advisory_lock')) {
          return { rows: [{ locked: true }] };
        }
        return { rows: [{ unlocked: true }] };
      }),
      end: vi.fn(async () => undefined),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as Client;

    const result = await tryAcquireFeeKeeperLock({
      databaseUrl: 'postgres://test',
      createLockClient: () => client,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      await result.lock.release();
    }
    expect(queries.some((q) => q.includes("hashtext('scoop_fee_keeper')"))).toBe(
      true,
    );
    expect(queries.some((q) => q.includes("hashtext('scoop_indexer')"))).toBe(
      false,
    );
  });
});
