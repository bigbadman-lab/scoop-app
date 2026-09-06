import type { Queryable } from '../types.js';
import { normalizeBytes32, toNumericString } from '../hex.js';

export interface IndexerCheckpointRow {
  chainId: number;
  streamName: string;
  lastBlockNumber: number | bigint;
  lastBlockHash: string;
  lastLogIndex?: number;
}

export async function upsertIndexerCheckpoint(
  db: Queryable,
  row: IndexerCheckpointRow,
): Promise<void> {
  await db.query(
    `INSERT INTO indexer_checkpoints (
      chain_id, stream_name, last_block_number, last_block_hash, last_log_index
    ) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (chain_id, stream_name) DO UPDATE SET
      last_block_number = EXCLUDED.last_block_number,
      last_block_hash = EXCLUDED.last_block_hash,
      last_log_index = EXCLUDED.last_log_index,
      updated_at = NOW()`,
    [
      row.chainId,
      row.streamName,
      toNumericString(row.lastBlockNumber),
      normalizeBytes32(row.lastBlockHash),
      row.lastLogIndex ?? -1,
    ],
  );
}

export async function getIndexerCheckpoint(
  db: Queryable,
  chainId: number,
  streamName: string,
): Promise<IndexerCheckpointRow | null> {
  const result = await db.query<{
    chain_id: string;
    stream_name: string;
    last_block_number: string;
    last_block_hash: string;
    last_log_index: number;
  }>(
    `SELECT chain_id, stream_name, last_block_number, last_block_hash, last_log_index
     FROM indexer_checkpoints
     WHERE chain_id = $1 AND stream_name = $2`,
    [chainId, streamName],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    chainId: Number(row.chain_id),
    streamName: row.stream_name,
    lastBlockNumber: BigInt(row.last_block_number),
    lastBlockHash: row.last_block_hash,
    lastLogIndex: row.last_log_index,
  };
}
