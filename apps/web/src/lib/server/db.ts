import { createPool, type Pool } from '@scoop/db';

let pool: Pool | null = null;

/**
 * Server-only Postgres pool from DATABASE_URL.
 * Never import this module from client components.
 */
export function getServerPool(): Pool {
  if (pool) return pool;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for server database access');
  }
  pool = createPool(databaseUrl);
  return pool;
}

export function resetServerPoolForTests(): void {
  pool = null;
}
