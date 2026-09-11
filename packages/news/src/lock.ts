/**
 * Dedicated news-ingest advisory lock — must never reuse scoop_indexer / fee_keeper.
 * Protects overlapping cron ticks from duplicate API quota burn and racing checkpoints.
 */
import { createClient, type Client } from '@scoop/db';

export const NEWS_INGEST_ADVISORY_LOCK_SQL = `hashtext('scoop_news_ingest')`;

export type NewsIngestLockHandle = {
  client: Client;
  release: () => Promise<void>;
};

export type TryAcquireNewsIngestLockResult =
  | { ok: true; lock: NewsIngestLockHandle }
  | { ok: false; reason: 'unavailable' | 'error'; error?: string };

/**
 * Single-attempt advisory lock for cron (no long wait).
 * Unavailable → caller exits cleanly; next tick retries.
 */
export async function tryAcquireNewsIngestLock(options: {
  databaseUrl: string;
  createLockClient?: (databaseUrl: string) => Client;
}): Promise<TryAcquireNewsIngestLockResult> {
  const createLockClient = options.createLockClient ?? createClient;
  if (!options.databaseUrl) {
    return { ok: false, reason: 'error', error: 'lock databaseUrl required' };
  }

  const client = createLockClient(options.databaseUrl);
  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${NEWS_INGEST_ADVISORY_LOCK_SQL}) AS locked`,
    );
    if (!result.rows[0]?.locked) {
      await client.end().catch(() => undefined);
      return { ok: false, reason: 'unavailable' };
    }

    let released = false;
    return {
      ok: true,
      lock: {
        client,
        release: async () => {
          if (released) return;
          released = true;
          try {
            await client.query(
              `SELECT pg_advisory_unlock(${NEWS_INGEST_ADVISORY_LOCK_SQL})`,
            );
          } catch {
            /* ignore */
          }
          try {
            await client.end();
          } catch {
            /* ignore */
          }
        },
      },
    };
  } catch (error) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      reason: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Guard for tests — lock SQL must not collide with other workers. */
export function isForeignWorkerLockSql(sql: string): boolean {
  return (
    sql.includes("hashtext('scoop_indexer')") ||
    sql.includes("hashtext('scoop_fee_keeper')") ||
    sql.includes("hashtext('scoop_holder_rewards')")
  );
}
