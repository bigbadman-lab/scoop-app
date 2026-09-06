import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface CreatorRow {
  chainId: number;
  creatorId: string;
  creatorType: string;
  walletAddress?: string | null;
  xUserId?: string | bigint | null;
  resolvedPayoutWallet?: string | null;
  isXClaimed?: boolean;
  firstSeenBlock?: number | bigint | null;
}

export async function upsertCreator(db: Queryable, row: CreatorRow): Promise<void> {
  await db.query(
    `INSERT INTO creators (
      chain_id, creator_id, creator_type, wallet_address, x_user_id,
      resolved_payout_wallet, is_x_claimed, first_seen_block
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (chain_id, creator_id) DO UPDATE SET
      creator_type = EXCLUDED.creator_type,
      wallet_address = EXCLUDED.wallet_address,
      x_user_id = EXCLUDED.x_user_id,
      resolved_payout_wallet = EXCLUDED.resolved_payout_wallet,
      is_x_claimed = EXCLUDED.is_x_claimed,
      first_seen_block = COALESCE(creators.first_seen_block, EXCLUDED.first_seen_block),
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeBytes32(row.creatorId),
      row.creatorType,
      row.walletAddress ? normalizeAddress(row.walletAddress) : null,
      row.xUserId == null ? null : toNumericString(row.xUserId),
      row.resolvedPayoutWallet ? normalizeAddress(row.resolvedPayoutWallet) : null,
      row.isXClaimed ?? false,
      row.firstSeenBlock == null ? null : toNumericString(row.firstSeenBlock),
    ],
  );
}
