/**
 * Operator CLI: set official $TAPE contract in protocol_settings.
 *
 * Usage:
 *   pnpm tape:set-contract 0x... --confirm
 *   pnpm tape:set-contract 0x... --confirm --override
 *
 * Never prints DATABASE_URL / RPC URL / secrets.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnvFile } from './lib/env-local.mjs';
import {
  ROBINHOOD_CHAIN_ID,
  normalizeTapeAddress,
  parseTapeSetContractArgs,
  verifyTapeContractOnChain,
} from './lib/tape-contract-verify.mjs';
import {
  TAPE_OFFICIAL_CONTRACT_KEY,
  ensureOfficialTapeRegistered,
  readOfficialTapeContract,
} from './lib/tge-official-tape-db.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function redactSecrets(message) {
  return String(message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***');
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

    const existing = await readOfficialTapeContract(client);
    if (
      existing &&
      existing.toLowerCase() !== address.toLowerCase() &&
      !parsed.override
    ) {
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

    if (
      existing &&
      existing.toLowerCase() !== address.toLowerCase() &&
      parsed.override
    ) {
      console.log(`Override: replacing ${existing} → ${address}`);
    }

    const result = await ensureOfficialTapeRegistered({
      client,
      candidate: address,
      allowOverride: Boolean(parsed.override),
    });

    if (result.status === 'ALREADY_COMPLETE') {
      console.log(`TAPE official contract is already set to ${result.canonical}`);
      console.log('No change required.');
      return;
    }

    if (result.status !== 'COMPLETE') {
      console.error(result.reason ?? 'Official TAPE registration failed.');
      process.exitCode = 1;
      return;
    }

    console.log('TAPE official contract updated');
    console.log(`Chain: ${ROBINHOOD_CHAIN_ID}`);
    console.log(`Address: ${result.canonical}`);
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
