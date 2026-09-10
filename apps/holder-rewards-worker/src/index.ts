import { runHolderRewardsWorker } from './run.js';
import { logJson } from './log.js';

/**
 * Production / cron entry: one-shot holder rewards worker.
 * Writes disabled unless SCOOP_HOLDER_REWARDS_WRITE_ENABLED=true.
 * Future Render cron (do not deploy in P8): 5 * * * *
 */
async function main(): Promise<void> {
  try {
    const result = await runHolderRewardsWorker();
    process.exitCode = result.exitCode;
  } catch (error) {
    logJson('error', 'holder_rewards_worker_crash', {
      errorClass: 'FATAL',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
