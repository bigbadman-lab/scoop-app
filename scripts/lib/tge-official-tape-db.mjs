/**
 * Shared official-TAPE protocol_settings primitive.
 * Used by tape:set-contract (may allowOverride) and TGE finalizer (never override).
 */
import { normalizeTapeAddress } from './tape-contract-verify.mjs';
import { TAPE_OFFICIAL_CONTRACT_KEY } from './tge-constants.mjs';

/**
 * @param {string | null | undefined} raw
 */
export function normalizeStoredAddress(raw) {
  if (raw == null) return null;
  return normalizeTapeAddress(String(raw));
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: { value?: string }[] }> }} client
 */
export async function readOfficialTapeContract(client) {
  const result = await client.query(
    `SELECT value FROM protocol_settings WHERE key = $1 LIMIT 1`,
    [TAPE_OFFICIAL_CONTRACT_KEY],
  );
  return normalizeStoredAddress(result.rows[0]?.value);
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<unknown> }} client
 * @param {`0x${string}`} address
 */
export async function upsertOfficialTapeContract(client, address) {
  await client.query(
    `INSERT INTO protocol_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
    [TAPE_OFFICIAL_CONTRACT_KEY, address.toLowerCase()],
  );
}

/**
 * @param {{
 *   existing: `0x${string}` | null,
 *   candidate: `0x${string}`,
 * }} args
 * @returns {'UNSET' | 'SAME_AS_CANDIDATE' | 'DIFFERENT_FROM_CANDIDATE'}
 */
export function classifyOfficialTapeDbState(args) {
  if (!args.existing) return 'UNSET';
  if (args.existing.toLowerCase() === args.candidate.toLowerCase()) {
    return 'SAME_AS_CANDIDATE';
  }
  return 'DIFFERENT_FROM_CANDIDATE';
}

/**
 * @param {{
 *   dbClassification: 'UNSET' | 'SAME_AS_CANDIDATE' | 'DIFFERENT_FROM_CANDIDATE',
 *   candidate: `0x${string}`,
 *   emulatedReadBack?: `0x${string}` | null,
 *   existing?: `0x${string}` | null,
 * }} args
 */
export function resolveCanonicalTapeAfterDbStage(args) {
  if (args.dbClassification === 'DIFFERENT_FROM_CANDIDATE') {
    return {
      status: 'BLOCKED',
      reason: 'BLOCKED — EXISTING OFFICIAL TAPE ADDRESS DIFFERS',
      canonical: null,
    };
  }
  if (args.dbClassification === 'SAME_AS_CANDIDATE') {
    return {
      status: 'ALREADY_COMPLETE',
      reason: null,
      canonical: args.existing ?? args.candidate,
    };
  }
  const canonical = args.emulatedReadBack ?? args.candidate;
  return {
    status: 'READY',
    reason: null,
    canonical,
  };
}

/**
 * Guarded register: write only when UNSET (or override allowed for standalone CLI).
 * Always returns canonical from read-back after a write.
 *
 * @param {{
 *   client: {
 *     query: (sql: string, params?: unknown[]) => Promise<{ rows: { value?: string }[] }>,
 *   },
 *   candidate: `0x${string}`,
 *   allowOverride?: boolean,
 * }} args
 */
export async function ensureOfficialTapeRegistered(args) {
  const candidate = normalizeTapeAddress(args.candidate);
  if (!candidate) {
    return {
      status: 'FAILED',
      reason: 'Invalid candidate address',
      canonical: null,
      classification: null,
    };
  }

  const existing = await readOfficialTapeContract(args.client);
  const classification = classifyOfficialTapeDbState({
    existing,
    candidate,
  });

  if (classification === 'SAME_AS_CANDIDATE') {
    return {
      status: 'ALREADY_COMPLETE',
      reason: null,
      canonical: existing,
      classification,
      wrote: false,
    };
  }

  if (classification === 'DIFFERENT_FROM_CANDIDATE') {
    if (!args.allowOverride) {
      return {
        status: 'BLOCKED',
        reason: 'BLOCKED — EXISTING OFFICIAL TAPE ADDRESS DIFFERS',
        canonical: null,
        classification,
        existing,
        wrote: false,
      };
    }
  }

  await upsertOfficialTapeContract(args.client, candidate);
  const readBack = await readOfficialTapeContract(args.client);
  if (!readBack || readBack.toLowerCase() !== candidate.toLowerCase()) {
    return {
      status: 'FAILED',
      reason: 'Write succeeded but read-back mismatch.',
      canonical: null,
      classification,
      wrote: true,
      readBack,
    };
  }

  return {
    status: 'COMPLETE',
    reason: null,
    canonical: readBack,
    classification,
    wrote: true,
    previous: existing,
  };
}

export { TAPE_OFFICIAL_CONTRACT_KEY };
