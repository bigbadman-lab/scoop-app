/**
 * Production entry (`dist/index.js`).
 * SCOOP_SOLANA_PUMP_INDEXING_ENABLED=false → idle heartbeat (default).
 * Live source: PumpPortal Data API (when enabled + configured).
 */

import { loadConfig, publicConfigView } from './config.js';
import { createHealthState } from './health.js';
import { runDisabledIdleMode } from './idle.js';
import { logJson } from './log.js';
import { runPumpMarketDataWorker } from './run.js';

async function main() {
  const config = loadConfig();
  const health = createHealthState(config.indexingEnabled, config.tradeProvider);

  logJson('info', 'solana-pump-worker startup', {
    config: publicConfigView(config),
    health: {
      enabled: health.enabled,
      provider: health.provider,
      providerStatus: health.providerStatus,
    },
    liveTradeSource: 'PUMPPORTAL_DATA_API',
  });

  if (!config.indexingEnabled) {
    await runDisabledIdleMode(config);
    return;
  }

  const { stop } = await runPumpMarketDataWorker(config);

  const onStop = (sig: string) => {
    logJson('info', 'solana-pump-worker signal', { signal: sig });
    void stop().then(() => {
      process.exitCode = 0;
    });
  };
  process.once('SIGTERM', () => onStop('SIGTERM'));
  process.once('SIGINT', () => onStop('SIGINT'));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logJson('error', 'solana-pump-worker failed', { error: message });
  process.exitCode = 1;
});
