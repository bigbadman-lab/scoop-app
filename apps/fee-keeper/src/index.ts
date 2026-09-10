import { runFeeKeeper } from './run.js';
import { logJson } from './log.js';

/**
 * Production / cron entry: one-shot fee keeper.
 * Writes disabled unless SCOOP_FEE_KEEPER_WRITE_ENABLED=true.
 */
async function main(): Promise<void> {
  try {
    const result = await runFeeKeeper();
    process.exitCode = result.exitCode;
  } catch (error) {
    logJson('error', 'fee_keeper_crash', {
      errorClass: 'FATAL',
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  }
}

void main();
