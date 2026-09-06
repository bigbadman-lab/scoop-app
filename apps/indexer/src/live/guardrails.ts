import type { Client, Pool, Queryable } from '@scoop/db';
import { createClient } from '@scoop/db';

/** Fixed advisory lock key: hashtext('scoop_indexer') — computed once via SQL. */
export const INDEXER_ADVISORY_LOCK_SQL = `hashtext('scoop_indexer')`;

export interface AdvisoryLockHandle {
  client: Client;
  release: () => Promise<void>;
}

/**
 * Acquire a session-level advisory lock on a dedicated connection.
 * Failures exit non-zero with a clear message (caller should process.exit).
 */
export async function acquireIndexerAdvisoryLock(
  databaseUrl: string,
): Promise<AdvisoryLockHandle> {
  const client = createClient(databaseUrl);
  await client.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${INDEXER_ADVISORY_LOCK_SQL}) AS locked`,
    );
    if (!result.rows[0]?.locked) {
      await client.end().catch(() => undefined);
      throw new Error(
        'Indexer singleton lock unavailable: another scoop indexer holds pg_advisory_lock(hashtext(\'scoop_indexer\')). Exit non-zero.',
      );
    }
  } catch (error) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    throw error;
  }

  return {
    client,
    release: async () => {
      try {
        await client.query(`SELECT pg_advisory_unlock(${INDEXER_ADVISORY_LOCK_SQL})`);
      } catch {
        /* ignore unlock errors */
      }
      try {
        await client.end();
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
