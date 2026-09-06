/**
 * Placeholder DB types for Phase 6A.4 bootstrap.
 * Generated Supabase / Postgres types will land here in a later phase.
 */
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
}
