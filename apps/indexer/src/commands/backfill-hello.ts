import { loadLocalEnv } from '../load-env.js';
import { backfillHello } from '../hello/backfill.js';

loadLocalEnv();

backfillHello().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'backfill-hello failed', error: message }),
  );
  process.exitCode = 1;
});
