import type { Client, Pool, Queryable } from '@scoop/db';
import { createClient } from '@scoop/db';

/** Fixed advisory lock key: hashtext('scoop_indexer') — computed once via SQL. */
export const INDEXER_ADVISORY_LOCK_SQL = `hashtext('scoop_indexer')`;

export interface AdvisoryLockHandle {
  client: Client;
  release: () => Promise<void>;
}

export interface AcquireIndexerAdvisoryLockOptions {
  /** Direct/non-pooled Postgres URL — dedicated session for the advisory lock only. */
  databaseUrl: string;
  /** Delay between acquisition attempts while waiting for a prior owner (default 5000). */
  retryMs?: number;
  /** Max time to wait for the lock before failing closed (default 120000). */
  waitTimeoutMs?: number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Called when an attempt fails and another retry will be scheduled. */
  onRetry?: (info: {
    attempt: number;
    waitedMs: number;
    remainingMs: number;
  }) => void;
  /**
   * Called if the dedicated lock session closes/errors after acquisition.
   * Caller must stop indexing — the advisory lock is no longer held.
   */
  onLockSessionLost?: () => void;
  /** Injectable client factory (defaults to @scoop/db createClient). */
  createLockClient?: (databaseUrl: string) => Client;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Acquire a session-level advisory lock on a dedicated (non-pooled) connection.
 * Retries while the lock is held by another indexer (rolling deploy), then fails closed.
 * The returned client must remain open for the lifetime of lock ownership.
 */
export async function acquireIndexerAdvisoryLock(
  options: AcquireIndexerAdvisoryLockOptions,
): Promise<AdvisoryLockHandle> {
  const {
    databaseUrl,
    retryMs = 5000,
    waitTimeoutMs = 120_000,
    sleep = defaultSleep,
    now = Date.now,
    onRetry,
    onLockSessionLost,
    createLockClient = createClient,
  } = options;

  if (!databaseUrl) {
    throw new Error('INDEXER_LOCK_DATABASE_URL (or lock databaseUrl) is required');
  }
  if (!Number.isFinite(retryMs) || retryMs <= 0) {
    throw new Error(`Invalid INDEXER_LOCK_RETRY_MS: ${retryMs}`);
  }
  if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs <= 0) {
    throw new Error(`Invalid INDEXER_LOCK_WAIT_TIMEOUT_MS: ${waitTimeoutMs}`);
  }

  const startedAt = now();
  const deadline = startedAt + waitTimeoutMs;
  let attempt = 0;
  let ownedClient: Client | null = null;

  while (ownedClient == null) {
    attempt += 1;
    const client = createLockClient(databaseUrl);
    try {
      await client.connect();
      const result = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_lock(${INDEXER_ADVISORY_LOCK_SQL}) AS locked`,
      );
      if (result.rows[0]?.locked) {
        ownedClient = client;
        break;
      }
      await client.end().catch(() => undefined);
    } catch (error) {
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      // Connection/query failures during acquisition: retry until timeout, then fail closed.
      const remainingAfterError = deadline - now();
      if (remainingAfterError <= 0) {
        throw error instanceof Error
          ? error
          : new Error(String(error));
      }
      onRetry?.({
        attempt,
        waitedMs: now() - startedAt,
        remainingMs: remainingAfterError,
      });
      await sleep(Math.min(retryMs, remainingAfterError));
      continue;
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw new Error(
        `Indexer singleton lock acquisition timed out after ${waitTimeoutMs}ms: another scoop indexer holds pg_advisory_lock(hashtext('scoop_indexer')). Exit non-zero.`,
      );
    }
    onRetry?.({
      attempt,
      waitedMs: now() - startedAt,
      remainingMs,
    });
    await sleep(Math.min(retryMs, remainingMs));
  }

  let released = false;
  const notifySessionLost = () => {
    if (!released) {
      onLockSessionLost?.();
    }
  };
  ownedClient.on('error', notifySessionLost);
  ownedClient.on('end', notifySessionLost);

  return {
    client: ownedClient,
    release: async () => {
      if (released) return;
      released = true;
      ownedClient.removeListener('error', notifySessionLost);
      ownedClient.removeListener('end', notifySessionLost);
      try {
        await ownedClient.query(`SELECT pg_advisory_unlock(${INDEXER_ADVISORY_LOCK_SQL})`);
      } catch {
        /* ignore unlock errors — closing the session releases the lock */
      }
      try {
        await ownedClient.end();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Startup migration compatibility: require 6A.6 launch_progress_bps column.
 */
export async function assertMigrationCompatibility(db: Queryable): Promise<void> {
  const result = await db.query(
    `SELECT 1 AS ok
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'token_market_state'
       AND column_name = 'launch_progress_bps'
     LIMIT 1`,
  );
  if (result.rows.length === 0) {
    throw new Error(
      'Migration compatibility check failed: token_market_state.launch_progress_bps missing. Apply supabase migrations through phase 6A.6+ before starting the indexer.',
    );
  }
}

export async function assertMigrationCompatibilityFromPool(pool: Pool): Promise<void> {
  await assertMigrationCompatibility(pool);
}
