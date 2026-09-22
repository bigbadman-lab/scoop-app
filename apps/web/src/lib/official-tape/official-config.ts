/**
 * Solana-native official $TAPE config (protocol_settings JSON).
 * Distinct from EVM `tape_official_contract` — never store base58 in that key.
 */

import type { Queryable } from '@scoop/db';
import {
  OFFICIAL_TAPE_DEPLOYER,
  OFFICIAL_TAPE_SYMBOL,
  TAPE_OFFICIAL_SOLANA_SETTING_KEY,
} from '@/lib/official-tape/constants';

export type OfficialTapeSolanaConfig = {
  chainFamily: 'solana';
  chainId: 900001;
  marketSource: 'pump';
  mint: string;
  symbol: typeof OFFICIAL_TAPE_SYMBOL;
  deployer: typeof OFFICIAL_TAPE_DEPLOYER;
  lockProvider: 'streamflow';
  lockVerified: boolean;
  lockId: string | null;
  lockSignature: string | null;
  unlockAt: string | null;
  lockAmountRaw: string | null;
  registeredAt: string;
};

export type SetOfficialTapeResult =
  | { status: 'inserted' | 'updated' | 'unchanged'; config: OfficialTapeSolanaConfig }
  | { status: 'blocked_existing'; config: OfficialTapeSolanaConfig; existing: OfficialTapeSolanaConfig };

function parseConfig(raw: string): OfficialTapeSolanaConfig | null {
  try {
    const v = JSON.parse(raw) as OfficialTapeSolanaConfig;
    if (
      v?.chainFamily !== 'solana' ||
      v.chainId !== 900001 ||
      v.marketSource !== 'pump' ||
      typeof v.mint !== 'string' ||
      v.symbol !== 'TAPE'
    ) {
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export async function getOfficialTapeSolanaConfig(
  db: Queryable,
): Promise<OfficialTapeSolanaConfig | null> {
  const result = await db.query<{ value: string }>(
    `SELECT value FROM protocol_settings WHERE key = $1 LIMIT 1`,
    [TAPE_OFFICIAL_SOLANA_SETTING_KEY],
  );
  const raw = result.rows[0]?.value;
  if (!raw?.trim()) return null;
  return parseConfig(raw.trim());
}

/**
 * Register official Solana $TAPE only after lock verification.
 * Different existing mint → BLOCK (no silent replace).
 */
export async function setOfficialTapeSolanaConfig(
  db: Queryable,
  config: OfficialTapeSolanaConfig,
  options: { allowOverride?: boolean } = {},
): Promise<SetOfficialTapeResult> {
  if (!config.lockVerified) {
    throw new Error('Refusing to register official TAPE without lockVerified=true');
  }
  if (config.deployer !== OFFICIAL_TAPE_DEPLOYER) {
    throw new Error('Official TAPE deployer mismatch');
  }
  if (config.symbol !== 'TAPE') {
    throw new Error('Official TAPE symbol must be TAPE');
  }

  const existing = await getOfficialTapeSolanaConfig(db);
  if (existing && existing.mint === config.mint) {
    const sameLock =
      existing.lockId === config.lockId &&
      existing.lockVerified === config.lockVerified &&
      existing.unlockAt === config.unlockAt;
    if (sameLock) {
      return { status: 'unchanged', config: existing };
    }
  }
  if (existing && existing.mint !== config.mint && !options.allowOverride) {
    return { status: 'blocked_existing', config, existing };
  }

  await db.query(
    `INSERT INTO protocol_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
    [TAPE_OFFICIAL_SOLANA_SETTING_KEY, JSON.stringify(config)],
  );

  return {
    status: existing ? 'updated' : 'inserted',
    config,
  };
}
