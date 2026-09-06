import { loadLocalEnv } from '../load-env.js';
import { resetHello } from '../hello/reset.js';

loadLocalEnv();

resetHello().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', message: 'reset-hello failed', error: message }),
  );
  process.exitCode = 1;
});
