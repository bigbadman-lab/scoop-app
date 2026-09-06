import type { Queryable } from '../types.js';
import { normalizeBytes32 } from '../hex.js';
import { formatRawAmount } from '../decimal.js';
import type { CreatorEarningsSummary } from '../dto.js';
import { DEFAULT_QUOTE_DECIMALS } from './_discoverySql.js';

export async function getCreatorEarnings(
  db: Queryable,
  chainId: number,
  creatorIdInput: string,
): Promise<CreatorEarningsSummary | null> {
  const creatorId = normalizeBytes32(creatorIdInput);

  const creatorResult = await db.query(
    `
    SELECT creator_id, creator_type, wallet_address, is_x_claimed
    FROM creators
    WHERE chain_id = $1 AND creator_id = $2
    LIMIT 1
    `,
    [chainId, creatorId],
  );

  const creator = creatorResult.rows[0] as
    | {
        creator_id: string;
        creator_type: string;
        wallet_address: string | null;
        is_x_claimed: boolean;
      }
    | undefined;

  // Allow earnings lookup even if creator row is missing (claimable-only).
  const assetsResult = await db.query(
    `
    SELECT
      ccs.asset_kind,
      ccs.asset_address,
      ccs.claimable_raw::text AS claimable_raw,
      ccs.source_block,
      COALESCE(cred.credited_raw, 0)::text AS credited_raw,
      COALESCE(cl.claimed_raw, 0)::text AS claimed_raw
    FROM creator_claimable_state ccs
    LEFT JOIN LATERAL (
      SELECT SUM(amount_raw) AS credited_raw
      FROM creator_credits
      WHERE chain_id = ccs.chain_id
        AND creator_id = ccs.creator_id
        AND asset_kind = ccs.asset_kind
        AND asset_address = ccs.asset_address
    ) cred ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(amount_raw) AS claimed_raw
      FROM creator_claims
      WHERE chain_id = ccs.chain_id
        AND creator_id = ccs.creator_id
        AND asset_kind = ccs.asset_kind
        AND asset_address = ccs.asset_address
    ) cl ON TRUE
    WHERE ccs.chain_id = $1 AND ccs.creator_id = $2
    ORDER BY ccs.asset_kind, ccs.asset_address
    `,
    [chainId, creatorId],
  );

  const tokenCountResult = await db.query(
    `SELECT COUNT(*)::int AS n FROM launches WHERE chain_id = $1 AND creator_id = $2`,
    [chainId, creatorId],
  );
  const tokenCount = Number(tokenCountResult.rows[0]?.n ?? 0);

  if (!creator && assetsResult.rows.length === 0 && tokenCount === 0) {
    return null;
  }

  return {
    chainId,
    creatorId,
    creatorType: creator?.creator_type ?? null,
    walletAddress: creator?.wallet_address ?? null,
    isXClaimed: creator?.is_x_claimed ?? null,
    tokenCount,
    assets: assetsResult.rows.map((row) => {
      const claimableRaw = String(row.claimable_raw);
      const decimals =
        String(row.asset_kind) === 'eth' || String(row.asset_address).endsWith('000000000000000000000000')
          ? DEFAULT_QUOTE_DECIMALS
          : 18;
      return {
        assetKind: String(row.asset_kind),
        assetAddress: String(row.asset_address),
        claimableRaw,
        claimableDisplay: formatRawAmount(claimableRaw, decimals),
        creditedRaw: String(row.credited_raw),
        claimedRaw: String(row.claimed_raw),
        sourceBlock: row.source_block == null ? null : Number(row.source_block),
      };
    }),
  };
}
