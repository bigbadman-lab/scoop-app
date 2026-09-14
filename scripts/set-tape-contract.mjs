/**
 * Operator CLI: set official $TAPE contract in protocol_settings.
 *
 * Usage:
 *   pnpm tape:set-contract 0x... --confirm
 *   pnpm tape:set-contract 0x... --confirm --override
 *
 * Never prints DATABASE_URL / RPC URL / secrets.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  ROBINHOOD_CHAIN_ID,
  normalizeTapeAddress,
  parseTapeSetContractArgs,
  verifyTapeContractOnChain,
} from './lib/tape-contract-verify.mjs';

const TAPE_OFFICIAL_CONTRACT_KEY = 'tape_official_contract';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function redactSecrets(message) {
  return String(message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***');
}

function normalizeStoredAddress(raw) {
  if (raw == null) return null;
  return normalizeTapeAddress(String(raw));
}

async function getExisting(client) {
  const result = await client.query(
    `SELECT value FROM protocol_settings WHERE key = $1 LIMIT 1`,
    [TAPE_OFFICIAL_CONTRACT_KEY],
  );
  return normalizeStoredAddress(result.rows[0]?.value);
}

async function upsert(client, address) {
  await client.query(
    `INSERT INTO protocol_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
    [TAPE_OFFICIAL_CONTRACT_KEY, address.toLowerCase()],
  );
}

function printHelp() {
  console.log(`Set the official $TAPE contract (runtime DB; no Vercel redeploy).

Usage:
  pnpm tape:set-contract <0xAddress> --confirm
  pnpm tape:set-contract <0xAddress> --confirm --override

Requires DATABASE_URL and ROBINHOOD_RPC_URL (env or .env.local).
Hard checks: valid address, chain ${ROBINHOOD_CHAIN_ID}, non-empty bytecode.
Soft checks: ERC-20 symbol / name / decimals (printed, non-fatal).
`);
}

async function main() {
  const parsed = parseTapeSetContractArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }
  if (parsed.error) {
    console.error(parsed.error);
    process.exit(1);
  }

  const address = normalizeTapeAddress(parsed.address);
  if (!address) {
    console.error('Invalid EVM address.');
    process.exit(1);
  }

  if (!parsed.confirm) {
    console.error(
      'Refusing to mutate without --confirm.\n' +
        `About to set the official TAPE contract:\n` +
        `Chain: Robinhood Chain (${ROBINHOOD_CHAIN_ID})\n` +
        `Address: ${address}\n` +
        `Re-run: pnpm tape:set-contract ${address} --confirm`,
    );
    process.exit(1);
  }

  const fileEnv = loadEnvFile(join(root, '.env.local'));
  const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  const rpcUrl = process.env.ROBINHOOD_RPC_URL || fileEnv.ROBINHOOD_RPC_URL;

  if (!databaseUrl) {
    console.error('DATABASE_URL is missing (set in environment or .env.local)');
    process.exit(1);
  }
  if (!rpcUrl) {
    console.error('ROBINHOOD_RPC_URL is missing (set in environment or .env.local)');
    process.exit(1);
  }

  console.log('Verifying on Robinhood Chain…');
  const verified = await verifyTapeContractOnChain({
    rpcUrl,
    address,
    expectedChainId: ROBINHOOD_CHAIN_ID,
  });
  if (!verified.ok) {
    console.error(`Verification failed: ${verified.reason}`);
    process.exit(1);
  }

  console.log(`Chain: Robinhood Chain (${verified.chainId})`);
  console.log(`Address: ${verified.address}`);
  console.log(`Bytecode: ${verified.bytecodeLength} bytes`);
  console.log(`Symbol: ${verified.symbol ?? '(unreadable)'}`);
  console.log(`Name: ${verified.name ?? '(unreadable)'}`);
  console.log(`Decimals: ${verified.decimals ?? '(unreadable)'}`);

  const client = new pg.Client({ connectionString: databaseUrl });
  try {
    await client.connect();

    // Ensure table exists (migration may not have been applied yet).
    const table = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'protocol_settings'
       LIMIT 1`,
    );
    if (table.rows.length === 0) {
      console.error(
        'protocol_settings table missing. Apply migrations first: pnpm db:migrate',
      );
      process.exitCode = 1;
      return;
    }

    const existing = await getExisting(client);

    if (existing && existing.toLowerCase() === address.toLowerCase()) {
      console.log(`TAPE official contract is already set to ${existing}`);
      console.log('No change required.');
      return;
    }

    if (existing && existing.toLowerCase() !== address.toLowerCase()) {
      if (!parsed.override) {
        console.error(
          `A different TAPE contract is already configured:\n` +
            `  Existing: ${existing}\n` +
            `  Requested: ${address}\n` +
            `Re-run with --override to replace intentionally:\n` +
            `  pnpm tape:set-contract ${address} --confirm --override`,
        );
        process.exitCode = 1;
        return;
      }
      console.log(`Override: replacing ${existing} → ${address}`);
    }

    await upsert(client, address);
    const readBack = await getExisting(client);
    if (!readBack || readBack.toLowerCase() !== address.toLowerCase()) {
      console.error('Write succeeded but read-back mismatch.');
      process.exitCode = 1;
      return;
    }

    console.log('TAPE official contract updated');
    console.log(`Chain: ${ROBINHOOD_CHAIN_ID}`);
    console.log(`Address: ${readBack}`);
    console.log(`Source: protocol_settings.${TAPE_OFFICIAL_CONTRACT_KEY}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed:', redactSecrets(message));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
