import { describe, expect, it, vi } from 'vitest';
import type { Client } from '@scoop/db';
import {
  acquireIndexerAdvisoryLock,
  assertMigrationCompatibility,
  INDEXER_ADVISORY_LOCK_SQL,
} from './guardrails.js';

type FakeClient = Client & {
  emit: (event: 'error' | 'end') => void;
};

function createFakeClient(opts: {
  locked: boolean | (() => boolean);
  connectError?: Error;
  queryError?: Error;
}): FakeClient {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const lockedValue = typeof opts.locked === 'function' ? opts.locked : () => opts.locked as boolean;

  const client = {
    connect: vi.fn(async () => {
      if (opts.connectError) throw opts.connectError;
    }),
    query: vi.fn(async (sql: string) => {
      if (opts.queryError && sql.includes('pg_try_advisory_lock')) {
        throw opts.queryError;
      }
      if (sql.includes('pg_try_advisory_lock')) {
        return { rows: [{ locked: lockedValue() }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        return { rows: [{ unlocked: true }] };
      }
      return { rows: [] };
    }),
    end: vi.fn(async () => undefined),
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      const set = listeners.get(event) ?? new Set();
      set.add(fn);
      listeners.set(event, set);
      return client;
    }),
    removeListener: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(fn);
      return client;
    }),
    emit: (event: 'error' | 'end') => {
      for (const fn of listeners.get(event) ?? []) {
        fn(event === 'error' ? new Error('connection lost') : undefined);
      }
    },
  };

  return client as unknown as FakeClient;
}

describe('indexer guardrails', () => {
  it('uses fixed hashtext advisory lock expression', () => {
    expect(INDEXER_ADVISORY_LOCK_SQL).toContain("hashtext('scoop_indexer')");
  });

  it('passes when launch_progress_bps column exists', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
    };
    await expect(assertMigrationCompatibility(db as never)).resolves.toBeUndefined();
  });

  it('fails clearly when column missing', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    await expect(assertMigrationCompatibility(db as never)).rejects.toThrow(
      /launch_progress_bps/,
    );
  });
});

describe('acquireIndexerAdvisoryLock', () => {
  it('acquires when lock is available', async () => {
    const client = createFakeClient({ locked: true });
    const handle = await acquireIndexerAdvisoryLock({
      databaseUrl: 'postgres://direct/lock',
      createLockClient: () => client,
      retryMs: 10,
      waitTimeoutMs: 100,
    });

    expect(client.connect).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_try_advisory_lock'),
    );
    expect(handle.client).toBe(client);
  });

  it('retries while busy then acquires before timeout', async () => {
    const outcomes = [false, false, true];
    const clients: FakeClient[] = [];
    let clock = 0;
    const onRetry = vi.fn();

    const handle = await acquireIndexerAdvisoryLock({
      databaseUrl: 'postgres://direct/lock',
      retryMs: 5,
      waitTimeoutMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      onRetry,
      createLockClient: () => {
        const locked = outcomes.shift() ?? false;
        const client = createFakeClient({ locked });
        clients.push(client);
        return client;
      },
    });

    expect(clients).toHaveLength(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(handle.client).toBe(clients[2]);
    expect(clients[0]!.end).toHaveBeenCalled();
    expect(clients[1]!.end).toHaveBeenCalled();
  });

  it('fails closed when lock stays unavailable for the wait window', async () => {
    let clock = 0;
    await expect(
      acquireIndexerAdvisoryLock({
        databaseUrl: 'postgres://direct/lock',
        retryMs: 10,
        waitTimeoutMs: 25,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
        createLockClient: () => createFakeClient({ locked: false }),
      }),
    ).rejects.toThrow(/timed out/);
  });

  it('unlocks and closes the dedicated connection on release (idempotent)', async () => {
    const client = createFakeClient({ locked: true });
    const handle = await acquireIndexerAdvisoryLock({
      databaseUrl: 'postgres://direct/lock',
      createLockClient: () => client,
      retryMs: 10,
      waitTimeoutMs: 50,
    });

    await handle.release();
    await handle.release();

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
    );
    expect(client.end).toHaveBeenCalledOnce();
  });

  it('notifies when the dedicated lock session is lost after acquisition', async () => {
    const client = createFakeClient({ locked: true });
    const onLockSessionLost = vi.fn();
    const handle = await acquireIndexerAdvisoryLock({
      databaseUrl: 'postgres://direct/lock',
      createLockClient: () => client,
      onLockSessionLost,
      retryMs: 10,
      waitTimeoutMs: 50,
    });

    client.emit('error');
    expect(onLockSessionLost).toHaveBeenCalledOnce();

    // Intentional release must not re-fire loss after listeners are removed.
    onLockSessionLost.mockClear();
    await handle.release();
    client.emit('end');
    expect(onLockSessionLost).not.toHaveBeenCalled();
  });

  it('rejects invalid retry/timeout values', async () => {
    await expect(
      acquireIndexerAdvisoryLock({
        databaseUrl: 'postgres://direct/lock',
        retryMs: 0,
        waitTimeoutMs: 100,
        createLockClient: () => createFakeClient({ locked: true }),
      }),
    ).rejects.toThrow(/INDEXER_LOCK_RETRY_MS/);

    await expect(
      acquireIndexerAdvisoryLock({
        databaseUrl: 'postgres://direct/lock',
        retryMs: 5,
        waitTimeoutMs: -1,
        createLockClient: () => createFakeClient({ locked: true }),
      }),
    ).rejects.toThrow(/INDEXER_LOCK_WAIT_TIMEOUT_MS/);
  });
});
