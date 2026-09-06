import { createPool, getIndexerCheckpoint, getIndexerHealth } from '@scoop/db';
import { loadLocalEnv } from '../load-env.js';
import { loadConfig, MAIN_STREAM_NAME, publicConfigView } from '../config.js';

loadLocalEnv();

async function main() {
  const config = loadConfig();
  const view = publicConfigView(config);

  if (!config.DATABASE_URL) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer status (no DATABASE_URL)',
        config: view,
      }),
    );
    return;
  }

  const pool = createPool(config.DATABASE_URL);
  try {
    const checkpoint = await getIndexerCheckpoint(pool, config.SCOOP_CHAIN_ID, MAIN_STREAM_NAME);
    const health = await getIndexerHealth(pool, config.SCOOP_CHAIN_ID);
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'indexer status',
        config: view,
        checkpoint: checkpoint
          ? {
              stream: checkpoint.streamName,
              lastBlock: checkpoint.lastBlockNumber.toString(),
              lastHash: checkpoint.lastBlockHash,
            }
          : null,
        health: health
          ? {
              heartbeatAt: health.heartbeatAt,
              latestIndexedBlock: health.latestIndexedBlock?.toString() ?? null,
              chainLatest: health.chainLatest?.toString() ?? null,
              chainSafe: health.chainSafe?.toString() ?? null,
              chainFinalized: health.chainFinalized?.toString() ?? null,
              lagBlocks: health.lagBlocks?.toString() ?? null,
              reorgCount: health.reorgCount?.toString() ?? null,
              watchlistSize: health.watchlistSize ?? null,
              activeRpc: health.activeRpc ?? null,
              wsConnected: health.wsConnected ?? null,
              notes: health.notes ?? null,
            }
          : null,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'indexer:status failed', error: message }),
  );
  process.exitCode = 1;
});
