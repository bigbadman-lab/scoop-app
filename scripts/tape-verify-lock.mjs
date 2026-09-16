/**
 * Read-only TAPE HoodLock lock verification (post-finalization / manual takeover).
 *
 * Usage:
 *   pnpm tape:verify-lock 0xTAPE_ADDRESS
 *
 * Never signs, never broadcasts, never writes DB.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnvFile } from './lib/env-local.mjs';
import { sanitizeSignerError } from './lib/tge-signer-env.mjs';
import { runTapeHoodlockLockVerification } from './lib/tge-verify-lock.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function redactSecrets(message) {
  return sanitizeSignerError(
    String(message)
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***')
      .replace(/https?:\/\/[^\s]*alchemy[^\s]*/gi, 'https://***'),
  );
}

function printHelp() {
  console.log(`TAPE HoodLock lock verification (read-only).

Usage:
  pnpm tape:verify-lock <0xTAPE_ADDRESS>

Checks chain 4663, token identity, InitialBuyExecuted allocation,
allowance(owner, HoodLock), existing matching locks, and optional
protocol_settings.tape_official_contract (if DATABASE_URL is set).

Never signs. Never broadcasts. Never writes the database.
`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    process.exit(0);
  }
  if (argv.length !== 1 || argv[0].startsWith('-')) {
    console.error('Usage: pnpm tape:verify-lock <0xTAPE_ADDRESS>');
    process.exit(1);
  }

  const fileEnv = loadEnvFile(join(root, '.env.local'));
  const rpcUrl = process.env.ROBINHOOD_RPC_URL || fileEnv.ROBINHOOD_RPC_URL;
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL || null;
  const expectedWallet =
    process.env.TAPE_TGE_DEV_BUY_WALLET || fileEnv.TAPE_TGE_DEV_BUY_WALLET || null;

  if (!rpcUrl) {
    console.error('ROBINHOOD_RPC_URL is missing (set in environment or .env.local)');
    process.exit(1);
  }

  /** @type {import('pg').Client | null} */
  let pgClient = null;
  /** @type {((sql: string, params?: unknown[]) => Promise<{ rows: { value?: string }[] }>) | null} */
  let pgQuery = null;

  if (databaseUrl) {
    pgClient = new pg.Client({ connectionString: databaseUrl });
    await pgClient.connect();
    pgQuery = (sql, params) => pgClient.query(sql, params);
  }

  try {
    const result = await runTapeHoodlockLockVerification({
      candidateRaw: argv[0],
      rpcUrl,
      databaseUrl,
      expectedWallet,
      pgQuery,
    });
    console.log(result.report);
    process.exit(result.exitCode);
  } finally {
    if (pgClient) await pgClient.end().catch(() => {});
  }
}

await main().catch((error) => {
  console.error('Failed:', redactSecrets(error));
  process.exit(1);
});
