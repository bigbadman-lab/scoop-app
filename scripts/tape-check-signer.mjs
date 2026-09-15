/**
 * Read-only TGE signer preflight.
 *
 * Usage:
 *   pnpm tape:check-signer
 *
 * Derives public address from TAPE_TGE_SIGNER_PRIVATE_KEY.
 * Verifies chain ID 4663.
 * Never signs, never broadcasts, never writes DB.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { loadEnvFile } from './lib/env-local.mjs';
import { ROBINHOOD_CHAIN_ID } from './lib/tge-constants.mjs';
import {
  resolveTapeTgeSignerFromEnv,
  sanitizeSignerError,
  TAPE_TGE_SIGNER_PRIVATE_KEY_ENV,
} from './lib/tge-signer-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const fileEnv = loadEnvFile(join(root, '.env.local'));
  const env = { ...fileEnv, ...process.env };

  const resolved = resolveTapeTgeSignerFromEnv(env);
  if (!resolved.ok) {
    console.error(resolved.reason);
    console.error(`Set ${TAPE_TGE_SIGNER_PRIVATE_KEY_ENV} in the ignored local env file.`);
    process.exit(1);
  }

  const rpcUrl = process.env.ROBINHOOD_RPC_URL || fileEnv.ROBINHOOD_RPC_URL;
  if (!rpcUrl) {
    console.error('ROBINHOOD_RPC_URL is missing (set in environment or .env.local)');
    process.exit(1);
  }

  let chainId;
  try {
    const client = createPublicClient({ transport: http(rpcUrl) });
    chainId = await client.getChainId();
  } catch (error) {
    console.error(`RPC unreachable: ${sanitizeSignerError(error)}`);
    process.exit(1);
  }

  if (chainId !== ROBINHOOD_CHAIN_ID) {
    console.error(
      `Wrong chain ID from RPC: got ${chainId}, expected ${ROBINHOOD_CHAIN_ID}`,
    );
    process.exit(1);
  }

  console.log('SIGNER CHECK — READ ONLY');
  console.log(`Chain: Robinhood Chain (${chainId})`);
  console.log(`Signer: ${resolved.address}`);
  console.log('No transaction was signed.');
  console.log('No transaction was broadcast.');
}

await main().catch((error) => {
  console.error('Failed:', sanitizeSignerError(error));
  process.exit(1);
});
