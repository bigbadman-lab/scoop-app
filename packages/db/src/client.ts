import type { ScoopDbClient, ScoopDbConfig } from './types.js';

/**
 * Create a non-connecting DB client stub.
 * Phase 6A.4 does not open Supabase or Postgres connections.
 */
export function createDbClient(config: ScoopDbConfig = {}): ScoopDbClient {
  const hasCredentials = Boolean(config.databaseUrl || config.serviceRoleKey);

  return {
    mode: hasCredentials ? 'service-role' : 'unconfigured',
    config,
  };
}
