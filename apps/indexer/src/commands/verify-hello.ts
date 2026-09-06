import { loadLocalEnv } from '../load-env.js';
import { formatHelloChecks, verifyHello } from '../hello/verify.js';

loadLocalEnv();

verifyHello()
  .then((checks) => {
    console.log(formatHelloChecks(checks));
    if (checks.some((c) => !c.pass)) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({ level: 'error', message: 'verify-hello failed', error: message }),
    );
    process.exitCode = 1;
  });
