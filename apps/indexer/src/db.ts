import { createDbClient, type ScoopDbClient } from '@scoop/db';
import type { IndexerConfig } from './config.js';

/** Mode-aware DB handle for startup logs. HELLO commands open their own pools. */
export function initDb(config: IndexerConfig): ScoopDbClient {
  return createDbClient({
    databaseUrl: config.DATABASE_URL,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
  });
}
