/**
 * Dedicated fee-keeper advisory lock — must never use scoop_indexer.
 */
import { createClient, type Client } from '@scoop/db';

export const FEE_KEEPER_ADVISORY_LOCK_SQL = `hashtext('scoop_fee_keeper')`;

export type FeeKeeperLockHandle = {
  client: Client;
  release: () => Promise<void>;
};

export type TryAcquireFeeKeeperLockResult =
  | { ok: true; lock: FeeKeeperLockHandle }
  | { ok: false; reason: 'unavailable' | 'error'; error?: string };

/**
 * Single-attempt advisory lock acquire for cron (no long wait).
 * Unavailable → caller exits cleanly without servicing.
 */
export async function tryAcquireFeeKeeperLock(options: {
  databaseUrl: string;
  createLockClient?: (databaseUrl: string) => Client;
}): Promise<TryAcquireFeeKeeperLockResult> {
  const createLockClient = options.createLockClient ?? createClient;
  if (!options.databaseUrl) {
    return { ok: false, reason: 'error', error: 'lock databaseUrl required' };
  }

  const client = createLockClient(options.databaseUrl);
  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${FEE_KEEPER_ADVISORY_LOCK_SQL}) AS locked`,
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
              `SELECT pg_advisory_unlock(${FEE_KEEPER_ADVISORY_LOCK_SQL})`,
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

/** Guard for tests — lock SQL must not reference indexer. */
export function isIndexerLockSql(sql: string): boolean {
  return sql.includes("hashtext('scoop_indexer')");
}
