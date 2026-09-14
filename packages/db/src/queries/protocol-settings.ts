import type { Queryable } from '../types.js';
import { normalizeAddress, type HexAddress } from '../hex.js';

/** Canonical key for the official $TAPE token contract. */
export const TAPE_OFFICIAL_CONTRACT_KEY = 'tape_official_contract' as const;

export type ProtocolSettingKey = typeof TAPE_OFFICIAL_CONTRACT_KEY | (string & {});

/**
 * Read a protocol setting by key. Returns null when unset / empty.
 */
export async function getProtocolSetting(
  db: Queryable,
  key: string,
): Promise<string | null> {
  const result = await db.query<{ value: string }>(
    `SELECT value FROM protocol_settings WHERE key = $1 LIMIT 1`,
    [key],
  );
  const raw = result.rows[0]?.value;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Official $TAPE contract from runtime DB settings.
 * Validates EVM address shape; returns null if unset or invalid (never fabricates).
 */
export async function getTapeOfficialContractAddress(
  db: Queryable,
): Promise<HexAddress | null> {
  const raw = await getProtocolSetting(db, TAPE_OFFICIAL_CONTRACT_KEY);
  if (!raw) return null;
  try {
    return normalizeAddress(raw);
  } catch {
    return null;
  }
}

export type SetTapeOfficialContractResult =
  | { status: 'inserted' | 'updated' | 'unchanged'; address: HexAddress }
  | { status: 'blocked_existing'; address: HexAddress; existing: HexAddress };

/**
 * Upsert official TAPE contract.
 * - Same address → unchanged (idempotent)
 * - Different address → requires allowOverride
 */
export async function setTapeOfficialContractAddress(
  db: Queryable,
  address: string,
  options: { allowOverride?: boolean } = {},
): Promise<SetTapeOfficialContractResult> {
  const normalized = normalizeAddress(address);
  const existing = await getTapeOfficialContractAddress(db);

  if (existing && existing === normalized) {
    return { status: 'unchanged', address: normalized };
  }

  if (existing && existing !== normalized && !options.allowOverride) {
    return { status: 'blocked_existing', address: normalized, existing };
  }

  await db.query(
    `INSERT INTO protocol_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
    [TAPE_OFFICIAL_CONTRACT_KEY, normalized],
  );

  return {
    status: existing ? 'updated' : 'inserted',
    address: normalized,
  };
}
