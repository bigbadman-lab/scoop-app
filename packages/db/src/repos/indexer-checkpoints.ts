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
