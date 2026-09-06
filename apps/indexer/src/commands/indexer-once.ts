import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { runIndexer } from '../live/runner.js';

loadLocalEnv();

/** One batch then exit. Requires SCOOP_INDEXING_ENABLED=true. */
async function main() {
  const config = loadConfig();
  if (!config.SCOOP_INDEXING_ENABLED) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer:once refused — set SCOOP_INDEXING_ENABLED=true',
      }),
    );
    process.exitCode = 1;
    return;
  }

  await runIndexer({
    config,
    maxBatches: 1,
    indexToBlock: config.SCOOP_INDEX_TO_BLOCK,
    enableWsWake: false,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: 'error', message: 'indexer:once failed', error: message }));
  process.exitCode = 1;
});
