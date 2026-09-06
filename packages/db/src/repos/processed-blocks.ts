import type { Queryable } from '../types.js';
import { normalizeBytes32, toNumericString } from '../hex.js';

export interface ProcessedBlockRow {
  chainId: number;
  blockNumber: number | bigint;
  blockHash: string;
  parentHash?: string | null;
  blockTimestamp?: number | bigint | null;
}

export async function upsertProcessedBlock(
  db: Queryable,
  row: ProcessedBlockRow,
): Promise<void> {
  await db.query(
    `INSERT INTO processed_blocks (
      chain_id, block_number, block_hash, parent_hash, block_timestamp
    ) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (chain_id, block_number) DO UPDATE SET
      block_hash = EXCLUDED.block_hash,
      parent_hash = EXCLUDED.parent_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      processed_at = NOW()`,
    [
      row.chainId,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      row.parentHash ? normalizeBytes32(row.parentHash) : null,
      row.blockTimestamp == null ? null : toNumericString(row.blockTimestamp),
    ],
  );
}

export async function getProcessedBlock(
  db: Queryable,
  chainId: number,
  blockNumber: number | bigint,
): Promise<ProcessedBlockRow | null> {
  const result = await db.query<{
    chain_id: string;
    block_number: string;
    block_hash: string;
    parent_hash: string | null;
    block_timestamp: string | null;
  }>(
    `SELECT chain_id, block_number, block_hash, parent_hash, block_timestamp
     FROM processed_blocks
     WHERE chain_id = $1 AND block_number = $2`,
    [chainId, toNumericString(blockNumber)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    chainId: Number(row.chain_id),
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash,
    parentHash: row.parent_hash,
    blockTimestamp: row.block_timestamp == null ? null : BigInt(row.block_timestamp),
  };
}

/** Delete processed_blocks with block_number >= fromBlock (inclusive). */
export async function deleteProcessedBlocksFrom(
  db: Queryable,
  chainId: number,
  fromBlock: number | bigint,
): Promise<number> {
  const result = await db.query(
    `DELETE FROM processed_blocks
     WHERE chain_id = $1 AND block_number >= $2`,
    [chainId, toNumericString(fromBlock)],
  );
  return result.rowCount ?? 0;
}

export async function listProcessedBlocksInWindow(
  db: Queryable,
  chainId: number,
  fromBlock: number | bigint,
  toBlock: number | bigint,
): Promise<ProcessedBlockRow[]> {
  const result = await db.query<{
    chain_id: string;
    block_number: string;
    block_hash: string;
    parent_hash: string | null;
    block_timestamp: string | null;
  }>(
    `SELECT chain_id, block_number, block_hash, parent_hash, block_timestamp
     FROM processed_blocks
     WHERE chain_id = $1 AND block_number >= $2 AND block_number <= $3
     ORDER BY block_number ASC`,
    [chainId, toNumericString(fromBlock), toNumericString(toBlock)],
  );
  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    blockNumber: BigInt(row.block_number),
    blockHash: row.block_hash,
    parentHash: row.parent_hash,
    blockTimestamp: row.block_timestamp == null ? null : BigInt(row.block_timestamp),
  }));
}
