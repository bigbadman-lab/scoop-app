import { createDbClient, type ScoopDbClient } from '@scoop/db';
import type { IndexerConfig } from './config.js';

/**
 * Phase 6A.4: stub only — does not open a database connection or write rows.
 */
export function initDb(config: IndexerConfig): ScoopDbClient {
  return createDbClient({
    databaseUrl: config.DATABASE_URL,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
  });
}
