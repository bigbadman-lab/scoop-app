#!/usr/bin/env node
import {
  parseProtocolResetArgs,
  runProtocolReset,
} from './reset-protocol.js';

async function main() {
  const opts = parseProtocolResetArgs(process.argv.slice(2));
  const result = await runProtocolReset(opts);
  console.log(
    JSON.stringify(
      {
        ts: new Date().toISOString(),
        level: 'info',
        message: result.dryRun
          ? 'protocol reset dry-run (no deletes)'
          : 'protocol-derived rows deleted',
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: 'error', message }));
  process.exitCode = 1;
});
