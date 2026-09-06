import type { Pool, PoolClient, Client, QueryResult, QueryResultRow } from 'pg';

export type DatabaseClientMode = 'service-role' | 'unconfigured';

export interface ScoopDbConfig {
  /** Postgres connection string for indexer / server (service role). */
  databaseUrl?: string;
  /** Supabase project URL (future). */
  supabaseUrl?: string;
  /** Supabase service-role key — never expose to the browser. */
  serviceRoleKey?: string;
}

export interface ScoopDbClient {
  mode: DatabaseClientMode;
  config: ScoopDbConfig;
  /** Connected pool when databaseUrl was provided; otherwise null. */
  pool: Pool | null;
}

export type Queryable = Pool | PoolClient | Client;

export type { Pool, PoolClient, Client, QueryResult, QueryResultRow };
