/**
 * Dedicated holder-rewards advisory lock — never scoop_fee_keeper / scoop_indexer.
 */
import { createClient, type Client } from '@scoop/db';

export const HOLDER_REWARDS_ADVISORY_LOCK_SQL = `hashtext('scoop_holder_rewards')`;

export type HolderRewardsLockHandle = {
  client: Client;
  release: () => Promise<void>;
};

export type TryAcquireHolderRewardsLockResult =
  | { ok: true; lock: HolderRewardsLockHandle }
  | { ok: false; reason: 'unavailable' | 'error'; error?: string };

export async function tryAcquireHolderRewardsLock(options: {
  databaseUrl: string;
  createLockClient?: (databaseUrl: string) => Client;
}): Promise<TryAcquireHolderRewardsLockResult> {
  const createLockClient = options.createLockClient ?? createClient;
  if (!options.databaseUrl) {
    return { ok: false, reason: 'error', error: 'lock databaseUrl required' };
  }
  const client = createLockClient(options.databaseUrl);
  try {
    await client.connect();
    const result = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(${HOLDER_REWARDS_ADVISORY_LOCK_SQL}) AS locked`,
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
              `SELECT pg_advisory_unlock(${HOLDER_REWARDS_ADVISORY_LOCK_SQL})`,
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

export function isForbiddenLockSql(sql: string): boolean {
  return (
    sql.includes("hashtext('scoop_indexer')") ||
    sql.includes("hashtext('scoop_fee_keeper')")
  );
}
