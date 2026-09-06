import { loadLocalEnv } from '../load-env.js';
import { loadConfig } from '../config.js';
import { runIndexer } from '../live/runner.js';
import { runDisabledIdleMode } from '../live/idle.js';

loadLocalEnv();

async function main() {
  const config = loadConfig();

  if (!config.SCOOP_INDEXING_ENABLED) {
    // Stay alive for Render Background Workers — exit 0 only on SIGTERM/SIGINT.
    // Zero chain ingest / projection writes while disabled.
    await runDisabledIdleMode(config);
    process.exitCode = 0;
    return;
  }

  await runIndexer({ config });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'indexer:start failed', error: message }),
  );
  process.exitCode = 1;
});
