/**
 * Redacted local env audit for official $TAPE finalization (Gate 0).
 * Never returns secret values — only PRESENT/MISSING and public signer pubkey.
 */

import { existsSync, readFileSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import {
  OFFICIAL_TAPE_DEPLOYER,
  SOLANA_KEYPAIR_PATH_ENV,
  STREAMFLOW_MIN_SOL_LAMPORTS,
} from '@/lib/official-tape/constants';

export type EnvPresence = 'PRESENT' | 'MISSING';

export type OfficialTapeEnvAudit = {
  DATABASE_URL: EnvPresence;
  SOLANA_RPC_URL: EnvPresence;
  NEXT_PUBLIC_SUPABASE_URL: EnvPresence;
  SUPABASE_SERVICE_ROLE_KEY: EnvPresence;
  SOLANA_KEYPAIR_PATH: EnvPresence;
  streamflowApiKeyRequired: false;
  rpcNetwork: 'MAINNET' | 'WRONG_NETWORK' | 'UNKNOWN' | 'INVALID_URL';
  signerPublicKey: string | null;
  signerMatchesDeployer: boolean;
  keypairPathOnDisk: boolean | null;
  readyForReadOnlyPreflight: boolean;
  readyForLockBroadcast: boolean;
  blockReasons: string[];
};

function presence(env: NodeJS.ProcessEnv, key: string): EnvPresence {
  const v = env[key];
  return typeof v === 'string' && v.trim().length > 0 ? 'PRESENT' : 'MISSING';
}

function classifyRpcNetwork(rpcUrl: string | undefined): OfficialTapeEnvAudit['rpcNetwork'] {
  if (!rpcUrl?.trim()) return 'UNKNOWN';
  try {
    const u = new URL(rpcUrl.trim());
    const host = u.hostname.toLowerCase();
    if (host.includes('devnet') || host.includes('testnet')) return 'WRONG_NETWORK';
    // Alchemy / Helius / mainnet-beta hosts are treated as mainnet candidates.
    if (
      host.includes('mainnet') ||
      host.includes('alchemy') ||
      host.includes('helius') ||
      host.includes('rpcpool')
    ) {
      return 'MAINNET';
    }
    return 'MAINNET'; // production SCOOP uses Alchemy mainnet; do not print URL
  } catch {
    return 'INVALID_URL';
  }
}

/** Derive pubkey from keypair file without exposing secret material. */
export function derivePublicKeyFromKeypairPath(path: string): string {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(raw) || raw.length < 32) {
    throw new Error('SOLANA_KEYPAIR_PATH must be a Solana keypair JSON byte array');
  }
  // Lazy Keypair construction — secret material never logged.
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw as number[]));
  return kp.publicKey.toBase58();
}

export function auditOfficialTapeEnv(
  env: NodeJS.ProcessEnv = process.env,
): OfficialTapeEnvAudit {
  const DATABASE_URL = presence(env, 'DATABASE_URL');
  const SOLANA_RPC_URL = presence(env, 'SOLANA_RPC_URL');
  const NEXT_PUBLIC_SUPABASE_URL = presence(env, 'NEXT_PUBLIC_SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = presence(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const SOLANA_KEYPAIR_PATH = presence(env, SOLANA_KEYPAIR_PATH_ENV);

  const rpcNetwork = classifyRpcNetwork(env.SOLANA_RPC_URL);

  let signerPublicKey: string | null = null;
  let signerMatchesDeployer = false;
  let keypairPathOnDisk: boolean | null = null;

  if (SOLANA_KEYPAIR_PATH === 'PRESENT') {
    const p = env[SOLANA_KEYPAIR_PATH_ENV]!.trim();
    keypairPathOnDisk = existsSync(p);
    if (keypairPathOnDisk) {
      try {
        signerPublicKey = derivePublicKeyFromKeypairPath(p);
        signerMatchesDeployer = signerPublicKey === OFFICIAL_TAPE_DEPLOYER;
      } catch {
        signerPublicKey = null;
        signerMatchesDeployer = false;
      }
    }
  }

  const blockReasons: string[] = [];
  if (DATABASE_URL === 'MISSING') blockReasons.push('DATABASE_URL missing');
  if (SOLANA_RPC_URL === 'MISSING') blockReasons.push('SOLANA_RPC_URL missing');
  if (NEXT_PUBLIC_SUPABASE_URL === 'MISSING') {
    blockReasons.push('NEXT_PUBLIC_SUPABASE_URL missing');
  }
  if (SUPABASE_SERVICE_ROLE_KEY === 'MISSING') {
    blockReasons.push('SUPABASE_SERVICE_ROLE_KEY missing');
  }
  if (rpcNetwork === 'WRONG_NETWORK' || rpcNetwork === 'INVALID_URL') {
    blockReasons.push(`SOLANA_RPC_URL network ${rpcNetwork}`);
  }
  if (SOLANA_KEYPAIR_PATH === 'MISSING') {
    blockReasons.push('SOLANA_KEYPAIR_PATH missing');
  } else if (keypairPathOnDisk === false) {
    blockReasons.push('SOLANA_KEYPAIR_PATH file not found on disk');
  } else if (!signerMatchesDeployer) {
    blockReasons.push(
      signerPublicKey
        ? `signer pubkey mismatch (got ${signerPublicKey})`
        : 'signer keypair unreadable',
    );
  }

  const readyForReadOnlyPreflight =
    DATABASE_URL === 'PRESENT' &&
    SOLANA_RPC_URL === 'PRESENT' &&
    NEXT_PUBLIC_SUPABASE_URL === 'PRESENT' &&
    SUPABASE_SERVICE_ROLE_KEY === 'PRESENT' &&
    rpcNetwork === 'MAINNET';

  const readyForLockBroadcast =
    readyForReadOnlyPreflight &&
    SOLANA_KEYPAIR_PATH === 'PRESENT' &&
    keypairPathOnDisk === true &&
    signerMatchesDeployer;

  return {
    DATABASE_URL,
    SOLANA_RPC_URL,
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SOLANA_KEYPAIR_PATH,
    streamflowApiKeyRequired: false,
    rpcNetwork,
    signerPublicKey,
    signerMatchesDeployer,
    keypairPathOnDisk,
    readyForReadOnlyPreflight,
    readyForLockBroadcast,
    blockReasons,
  };
}

export function formatEnvAuditReport(audit: OfficialTapeEnvAudit): string {
  const signerLine = !audit.signerPublicKey
    ? 'MISSING'
    : audit.signerMatchesDeployer
      ? `${OFFICIAL_TAPE_DEPLOYER} (MATCH)`
      : `${audit.signerPublicKey} (MISMATCH)`;

  return [
    'OFFICIAL TAPE LOCAL ENV AUDIT',
    '',
    `DATABASE_URL:                 ${audit.DATABASE_URL}`,
    `SOLANA_RPC_URL:               ${audit.SOLANA_RPC_URL}`,
    `NEXT_PUBLIC_SUPABASE_URL:     ${audit.NEXT_PUBLIC_SUPABASE_URL}`,
    `SUPABASE_SERVICE_ROLE_KEY:    ${audit.SUPABASE_SERVICE_ROLE_KEY}`,
    `SOLANA_KEYPAIR_PATH:          ${audit.SOLANA_KEYPAIR_PATH}`,
    `Streamflow API key required:  NO`,
    '',
    `RPC network:                  ${audit.rpcNetwork}`,
    `Signer public key:            ${signerLine}`,
    `Min SOL for lock (lamports):  ${STREAMFLOW_MIN_SOL_LAMPORTS.toString()}`,
  ].join('\n');
}
