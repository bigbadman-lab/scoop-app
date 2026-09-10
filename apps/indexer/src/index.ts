import {
  CANONICAL_PROTOCOL_COMMIT,
  CANONICAL_PROTOCOL_TAG,
  canonicalProductionManifest,
  historicalTestCanaryManifest,
  scoopV1MainnetCanaryManifest,
} from '@scoop/contracts';
import { loadConfig, publicConfigView } from './config.js';
import { createChainDefinition } from './chain.js';
import { initDb } from './db.js';
import { getHealthStatus } from './health.js';
import { runIndexer } from './live/runner.js';
import { runDisabledIdleMode } from './live/idle.js';

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

/**
 * Production Docker entry (`dist/index.js`).
 * - SCOOP_INDEXING_ENABLED=false → Render-safe idle heartbeat (no crash-loop)
 * - SCOOP_INDEXING_ENABLED=true → continuous live indexer
 */
async function main() {
  const config = loadConfig();
  const chain = createChainDefinition(config);
  const db = initDb(config);
  const health = getHealthStatus(config.SCOOP_INDEXING_ENABLED);

  logJson('info', 'scoop-indexer startup', {
    service: 'scoop-indexer',
    phase: 'E.1b',
    protocol: {
      tag: CANONICAL_PROTOCOL_TAG,
      commit: CANONICAL_PROTOCOL_COMMIT,
      productionStatus: canonicalProductionManifest.status,
      operationalManifest: 'historical-test-only',
      factory: historicalTestCanaryManifest.contracts.ScoopFactory,
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
    // Stay alive for Render Background Workers — matches indexer-start idle path.
    await runDisabledIdleMode(config);
    return;
  }

  await runIndexer({ config });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logJson('error', 'indexer failed', { error: message });
  process.exitCode = 1;
});
