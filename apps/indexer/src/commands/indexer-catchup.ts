import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { runIndexer } from '../live/runner.js';

loadLocalEnv();

/**
 * Bounded catchup: process until head-lag or SCOOP_INDEX_TO_BLOCK, then exit.
 * Requires SCOOP_INDEXING_ENABLED=true.
 */
async function main() {
  const config = loadConfig();
  if (!config.SCOOP_INDEXING_ENABLED) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:catchup refused — set SCOOP_INDEXING_ENABLED=true',
      }),
    );
    process.exitCode = 1;
    return;
  }

  // Cap batches so catchup cannot run forever even if head keeps moving
  const maxBatches = Number(process.env.SCOOP_CATCHUP_MAX_BATCHES ?? 50);
  await runIndexer({
    config,
    maxBatches,
    indexToBlock: config.SCOOP_INDEX_TO_BLOCK,
    headLagTarget: 0,
    enableWsWake: false,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'indexer:catchup failed', error: message }),
  );
  process.exitCode = 1;
});
