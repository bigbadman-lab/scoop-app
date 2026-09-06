import pg from 'pg';
import type { ScoopDbClient, ScoopDbConfig, Queryable } from './types.js';
import type { Pool, PoolClient, Client } from 'pg';

const { Pool: PgPool, Client: PgClient } = pg;

export function createPool(databaseUrl: string): Pool {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a pool');
  }
  return new PgPool({ connectionString: databaseUrl });
}

export function createClient(databaseUrl: string): Client {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a client');
  }
  return new PgClient({ connectionString: databaseUrl });
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mode-aware helper for startup / health.
 * Opens a pool when databaseUrl is set; does not run queries.
 */
export function createDbClient(config: ScoopDbConfig = {}): ScoopDbClient {
  const hasCredentials = Boolean(config.databaseUrl || config.serviceRoleKey);
  const pool = config.databaseUrl ? createPool(config.databaseUrl) : null;

  return {
    mode: hasCredentials ? 'service-role' : 'unconfigured',
    config,
    pool,
  };
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  db: Queryable,
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return db.query<T>(text, params);
}
