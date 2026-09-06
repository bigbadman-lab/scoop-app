import {
  CANONICAL_PROTOCOL_COMMIT,
  CANONICAL_PROTOCOL_TAG,
  scoopV1MainnetCanaryManifest,
} from '@scoop/contracts';
import { loadConfig, publicConfigView } from './config.js';
import { createChainDefinition } from './chain.js';
import { initDb } from './db.js';
import { getHealthStatus } from './health.js';

function logJson(level: string, message: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...fields,
    }),
  );
}

async function main() {
  const config = loadConfig();
  const chain = createChainDefinition(config);
  const db = initDb(config);
  const health = getHealthStatus(config.SCOOP_INDEXING_ENABLED);

  logJson('info', 'scoop-indexer startup', {
    service: 'scoop-indexer',
    phase: '6A.4',
    protocol: {
      tag: CANONICAL_PROTOCOL_TAG,
      commit: CANONICAL_PROTOCOL_COMMIT,
      factory: scoopV1MainnetCanaryManifest.contracts.ScoopFactory,
      helloToken: scoopV1MainnetCanaryManifest.fixtures.hello.token,
    },
    chain: {
      id: chain.id,
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
    },
    config: publicConfigView(config),
    dbMode: db.mode,
    health,
  });

  if (!config.SCOOP_INDEXING_ENABLED) {
    logJson('info', 'Live indexing is disabled in Phase 6A.4', {
      indexingEnabled: false,
      note: 'No RPC log fetch and no DB writes will occur',
    });
    logJson('info', 'Indexer bootstrap complete; exiting cleanly');
    return;
  }

  // Guarded path for later phases — still refuse to ingest in 6A.4 codepaths.
  throw new Error('SCOOP_INDEXING_ENABLED=true is not supported in Phase 6A.4 bootstrap');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logJson('error', 'indexer failed', { error: message });
  process.exitCode = 1;
});
