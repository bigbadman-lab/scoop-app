import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32 } from '../hex.js';

export interface AddressClassificationRow {
  chainId: number;
  address: string;
  class: string;
  label: string;
  relatedToken?: string;
  relatedPool?: string | null;
  activeFromBlock?: number | bigint | null;
  activeToBlock?: number | bigint | null;
  metadata?: unknown | null;
}

export async function upsertAddressClassification(
  db: Queryable,
  row: AddressClassificationRow,
): Promise<void> {
  const relatedToken = row.relatedToken ? normalizeAddress(row.relatedToken) : '';
  await db.query(
    `INSERT INTO address_classifications (
      chain_id, address, class, label, related_token, related_pool,
      active_from_block, active_to_block, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    ON CONFLICT (chain_id, address, class, related_token) DO UPDATE SET
      label = EXCLUDED.label,
      related_pool = EXCLUDED.related_pool,
      active_from_block = EXCLUDED.active_from_block,
      active_to_block = EXCLUDED.active_to_block,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      row.chainId,
      normalizeAddress(row.address),
      row.class,
      row.label,
      relatedToken,
      row.relatedPool ? normalizeBytes32(row.relatedPool) : null,
      row.activeFromBlock == null ? null : Number(row.activeFromBlock),
      row.activeToBlock == null ? null : Number(row.activeToBlock),
      row.metadata == null ? null : JSON.stringify(row.metadata),
    ],
  );
}
