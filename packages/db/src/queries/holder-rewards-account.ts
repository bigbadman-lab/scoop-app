import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export type HolderRewardAccountEntitlement = {
  chainId: number;
  vault: string;
  tokenAddress: string;
  roundId: string;
  asset: string;
  account: string;
  entitlementRaw: string;
  leafHash: string;
  proof: string[];
  snapshotBlock: string;
  workerRoundStatus: string;
  workerMerkleRoot: string | null;
  publishedTxHash: string | null;
};

const PROOF_HEX_RE = /^0[xX][0-9a-fA-F]{64}$/;

/**
 * Parse entitlement proof_json into lowercase bytes32[].
 * Throws on malformed data — never pass arbitrary JSON to callers.
 */
export function parseHolderRewardProofJson(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('Invalid holder reward proof_json: not JSON');
    }
  }
  if (!Array.isArray(value)) {
    throw new Error('Invalid holder reward proof_json: expected array');
  }
  return value.map((item, index) => {
    if (typeof item !== 'string' || !PROOF_HEX_RE.test(item)) {
      throw new Error(`Invalid holder reward proof entry at index ${index}`);
    }
    return `0x${item.slice(2).toLowerCase()}`;
  });
}

/**
 * List holder-reward entitlements for a wallet account.
 *
 * Requires P8 tables (`holder_reward_entitlements`, `holder_reward_worker_rounds`).
 * Callers MUST gate with an explicit feature/config switch before invoking —
 * do not use this on pre-P5/pre-P8 production DBs.
 *
 * Does not join `launches.holder_rewards_address` (avoids extra P5 coupling).
 * Vault on the entitlement row is the claim target.
 * Does not treat `push_status` as payment authority.
 */
export async function listHolderRewardEntitlementsForAccount(
  db: Queryable,
  args: { chainId: number; account: string },
): Promise<HolderRewardAccountEntitlement[]> {
  if (!Number.isInteger(args.chainId) || args.chainId <= 0) {
    throw new Error(`Invalid chainId: ${args.chainId}`);
  }
  const account = normalizeAddress(args.account);

  const result = await db.query<{
    chain_id: number;
    vault_address: string;
    token_address: string;
    round_id: string | number;
    asset_address: string;
    account_address: string;
    entitlement_raw: string;
    leaf_hash: string;
    proof_json: unknown;
    snapshot_block: string | number;
    worker_round_status: string;
    worker_merkle_root: string | null;
    published_tx_hash: string | null;
  }>(
    `SELECT
       e.chain_id,
       e.vault_address,
       r.token_address,
       e.round_id,
       e.asset_address,
       e.account_address,
       e.entitlement_raw,
       e.leaf_hash,
       e.proof_json,
       e.snapshot_block,
       r.status AS worker_round_status,
       r.merkle_root AS worker_merkle_root,
       r.published_tx_hash
     FROM holder_reward_entitlements e
     INNER JOIN holder_reward_worker_rounds r
       ON r.chain_id = e.chain_id
      AND r.vault_address = e.vault_address
      AND r.round_id = e.round_id
      AND r.asset_address = e.asset_address
     WHERE e.chain_id = $1
       AND e.account_address = $2
     ORDER BY e.round_id DESC, e.vault_address ASC, e.asset_address ASC`,
    [args.chainId, account],
  );

  return result.rows.map((row) => {
    const proof = parseHolderRewardProofJson(row.proof_json);
    const rootRaw = row.worker_merkle_root;
    const publishedRaw = row.published_tx_hash;
    return {
      chainId: Number(row.chain_id),
      vault: normalizeAddress(row.vault_address),
      tokenAddress: normalizeAddress(row.token_address),
      roundId: toNumericString(row.round_id),
      asset: normalizeAddress(row.asset_address),
      account: normalizeAddress(row.account_address),
      entitlementRaw: toNumericString(row.entitlement_raw),
      leafHash: normalizeBytes32(row.leaf_hash),
      proof,
      snapshotBlock: toNumericString(row.snapshot_block),
      workerRoundStatus: String(row.worker_round_status),
      workerMerkleRoot:
        rootRaw == null || String(rootRaw).trim() === ''
          ? null
          : normalizeBytes32(String(rootRaw)),
      publishedTxHash:
        publishedRaw == null || String(publishedRaw).trim() === ''
          ? null
          : normalizeBytes32(String(publishedRaw)),
    };
  });
}
