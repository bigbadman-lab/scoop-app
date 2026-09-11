import { describe, expect, it, vi } from 'vitest';
import {
  NEWS_INGEST_ADVISORY_LOCK_SQL,
  isForeignWorkerLockSql,
  tryAcquireNewsIngestLock,
} from './lock.js';

describe('news ingest advisory lock', () => {
  it('uses a dedicated news lock key', () => {
    expect(NEWS_INGEST_ADVISORY_LOCK_SQL).toContain("hashtext('scoop_news_ingest')");
    expect(isForeignWorkerLockSql(NEWS_INGEST_ADVISORY_LOCK_SQL)).toBe(false);
    expect(isForeignWorkerLockSql("hashtext('scoop_indexer')")).toBe(true);
    expect(isForeignWorkerLockSql("hashtext('scoop_fee_keeper')")).toBe(true);
  });

  it('returns unavailable when lock is held', async () => {
    const end = vi.fn(async () => undefined);
    const query = vi.fn(async () => ({ rows: [{ locked: false }] }));
    const connect = vi.fn(async () => undefined);
    const result = await tryAcquireNewsIngestLock({
      databaseUrl: 'postgresql://test',
      createLockClient: () =>
        ({ connect, query, end }) as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unavailable');
    expect(end).toHaveBeenCalled();
  });

  it('acquires and releases the lock', async () => {
    const end = vi.fn(async () => undefined);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ locked: true }] };
      }
      return { rows: [{ unlocked: true }] };
    });
    const connect = vi.fn(async () => undefined);
    const result = await tryAcquireNewsIngestLock({
      databaseUrl: 'postgresql://test',
      createLockClient: () =>
        ({ connect, query, end }) as never,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await result.lock.release();
    expect(query.mock.calls.some((c) => String(c[0]).includes('pg_advisory_unlock'))).toBe(
      true,
    );
    expect(end).toHaveBeenCalled();
  });
});
