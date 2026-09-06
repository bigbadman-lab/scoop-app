import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface TransferRow {
  chainId: number;
  tokenAddress: string;
  txHash: string;
  logIndex: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  fromAddress: string;
  toAddress: string;
  amountRaw: string | bigint;
  transferClass?: string | null;
}

export async function upsertTransfer(db: Queryable, row: TransferRow): Promise<void> {
  await db.query(
    `INSERT INTO transfers (
      chain_id, token_address, tx_hash, log_index, block_number, block_hash, block_timestamp,
      from_address, to_address, amount_raw, transfer_class
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      token_address = EXCLUDED.token_address,
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      from_address = EXCLUDED.from_address,
      to_address = EXCLUDED.to_address,
      amount_raw = EXCLUDED.amount_raw,
      transfer_class = EXCLUDED.transfer_class`,
    [
      row.chainId,
      normalizeAddress(row.tokenAddress),
      normalizeBytes32(row.txHash),
      row.logIndex,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      normalizeAddress(row.fromAddress),
      normalizeAddress(row.toAddress),
      toNumericString(row.amountRaw),
      row.transferClass ?? null,
    ],
  );
}
