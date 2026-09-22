/**
 * Load local Solana deployer Keypair from SOLANA_KEYPAIR_PATH.
 * Never logs secret bytes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import {
  OFFICIAL_TAPE_DEPLOYER,
  SOLANA_KEYPAIR_PATH_ENV,
} from '@/lib/official-tape/constants';

export function loadOfficialTapeDeployerKeypair(
  env: NodeJS.ProcessEnv = process.env,
): Keypair {
  const path = env[SOLANA_KEYPAIR_PATH_ENV]?.trim();
  if (!path) {
    throw new Error('BLOCKED — SAFE LOCAL DEPLOYER SIGNER NOT AVAILABLE');
  }
  if (!existsSync(path)) {
    throw new Error('BLOCKED — SAFE LOCAL DEPLOYER SIGNER NOT AVAILABLE');
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(raw) || raw.length < 32) {
    throw new Error('SOLANA_KEYPAIR_PATH must be a Solana keypair JSON byte array');
  }
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
  const pub = kp.publicKey.toBase58();
  if (pub !== OFFICIAL_TAPE_DEPLOYER) {
    throw new Error(
      `BLOCKED — signer pubkey ${pub} does not match expected deployer ${OFFICIAL_TAPE_DEPLOYER}`,
    );
  }
  return kp;
}
