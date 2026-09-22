/**
 * Official Solana $TAPE finalization constants.
 * Public deployer identity only — never a private key.
 */

import { SCOOP_SUPPORT_WALLET } from '@scoop/shared';

/** Pump creator / Streamflow sender+recipient — same as public support wallet. */
export const OFFICIAL_TAPE_DEPLOYER = SCOOP_SUPPORT_WALLET;

export const OFFICIAL_TAPE_SYMBOL = 'TAPE' as const;

export const OFFICIAL_TAPE_LOCK_CALENDAR_MONTHS = 6 as const;

/** Exact irreversible confirmation phrase (Gate 6). */
export const OFFICIAL_TAPE_LOCK_CONFIRM_PHRASE = 'LOCK TAPE FOR 6 MONTHS' as const;

/** protocol_settings key — JSON blob for Solana official token (not EVM address). */
export const TAPE_OFFICIAL_SOLANA_SETTING_KEY = 'tape_official_solana' as const;

/** Env: absolute path to local Solana keypair JSON. */
export const SOLANA_KEYPAIR_PATH_ENV = 'SOLANA_KEYPAIR_PATH' as const;

/**
 * Streamflow default creation fee (lamports) from SDK 13.4.0.
 * Plus tx/ATA buffer — operator must hold ≥ this before broadcast.
 */
export const STREAMFLOW_CREATION_FEE_LAMPORTS = BigInt(90_000_000); // 0.09 SOL
export const STREAMFLOW_SOL_SAFETY_BUFFER_LAMPORTS = BigInt(30_000_000); // 0.03 SOL
export const STREAMFLOW_MIN_SOL_LAMPORTS =
  STREAMFLOW_CREATION_FEE_LAMPORTS + STREAMFLOW_SOL_SAFETY_BUFFER_LAMPORTS;
