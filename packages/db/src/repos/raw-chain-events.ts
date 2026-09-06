import type { Queryable } from '../types.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';

export interface RawChainEventRow {
  chainId: number;
  blockNumber: number | bigint;
  blockHash: string;
  blockTimestamp: number | bigint;
  txHash: string;
  txIndex: number;
  logIndex: number;
  contractAddress: string;
  topic0: string;
  topics: unknown;
  data: string;
  decodedEventName?: string | null;
  decodedPayload?: unknown | null;
  confirmationStatus?: string;
  isCanonical?: boolean;
}

export async function upsertRawChainEvent(db: Queryable, row: RawChainEventRow): Promise<void> {
  await db.query(
    `INSERT INTO raw_chain_events (
      chain_id, block_number, block_hash, block_timestamp, tx_hash, tx_index, log_index,
      contract_address, topic0, topics, data, decoded_event_name, decoded_payload,
      confirmation_status, is_canonical
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15
    )
    ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
      block_number = EXCLUDED.block_number,
      block_hash = EXCLUDED.block_hash,
      block_timestamp = EXCLUDED.block_timestamp,
      tx_index = EXCLUDED.tx_index,
      contract_address = EXCLUDED.contract_address,
      topic0 = EXCLUDED.topic0,
      topics = EXCLUDED.topics,
      data = EXCLUDED.data,
      decoded_event_name = EXCLUDED.decoded_event_name,
      decoded_payload = EXCLUDED.decoded_payload,
      confirmation_status = EXCLUDED.confirmation_status,
      is_canonical = EXCLUDED.is_canonical`,
    [
      row.chainId,
      toNumericString(row.blockNumber),
      normalizeBytes32(row.blockHash),
      toNumericString(row.blockTimestamp),
      normalizeBytes32(row.txHash),
      row.txIndex,
      row.logIndex,
      normalizeAddress(row.contractAddress),
      normalizeBytes32(row.topic0),
      JSON.stringify(row.topics),
      row.data,
      row.decodedEventName ?? null,
      row.decodedPayload == null ? null : JSON.stringify(row.decodedPayload),
      row.confirmationStatus ?? 'confirmed',
      row.isCanonical ?? true,
    ],
  );
}
