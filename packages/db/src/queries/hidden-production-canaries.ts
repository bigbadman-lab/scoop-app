import { normalizeAddress, type HexAddress } from '../hex.js';

/**
 * Production validation canaries (S5FA/B/C).
 * Valid SCOOP markets — hidden from public discovery/list surfaces only.
 * Direct `/token/[address]` and detail APIs remain available.
 */
export const HIDDEN_PRODUCTION_CANARY_TOKENS = [
  '0x48f91579d27d044681098eb4e5b4b92b3f83ef7d', // S5FA
  '0x6509630f521bcf07dd69c38fd80882852ae5fdc5', // S5FB
  '0x9903aa6646d1bb29bb584724e66c42a5cd318814', // S5FC
] as const satisfies readonly HexAddress[];

const HIDDEN_SET = new Set<string>(HIDDEN_PRODUCTION_CANARY_TOKENS);

export function isHiddenProductionCanary(address: string): boolean {
  const trimmed = address.trim();
  if (!trimmed) return false;
  try {
    return HIDDEN_SET.has(normalizeAddress(trimmed));
  } catch {
    return HIDDEN_SET.has(trimmed.toLowerCase());
  }
}

/**
 * SQL AND-fragment for discovery/list queries (launches aliased as `l`).
 * Uses lowercase literals; pair with `lower(l.token_address)`.
 */
export const HIDDEN_PRODUCTION_CANARY_SQL = `
  AND lower(l.token_address) NOT IN (
    '0x48f91579d27d044681098eb4e5b4b92b3f83ef7d',
    '0x6509630f521bcf07dd69c38fd80882852ae5fdc5',
    '0x9903aa6646d1bb29bb584724e66c42a5cd318814'
  )
`;
