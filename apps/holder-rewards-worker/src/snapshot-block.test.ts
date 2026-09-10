import { describe, expect, it, vi } from 'vitest';
import { resolveSnapshotBlock } from './snapshot-block.js';

describe('snapshot block determinism', () => {
  it('skips when indexer behind confirmations', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('holder_reward_worker_rounds')) {
          return { rows: [] };
        }
        if (sql.includes('processed_blocks')) {
          return {
            rows: [
              {
                block_number: '1000',
                block_hash: `0x${'ab'.repeat(32)}`,
                block_timestamp: '7200',
              },
            ],
          };
        }
        if (sql.includes('indexer_checkpoints')) {
          return { rows: [{ last_block_number: '1010' }] };
        }
        return { rows: [] };
      }),
    };
    const result = await resolveSnapshotBlock({
      db: db as never,
      chainId: 4663,
      vaultAddress: '0x1111111111111111111111111111111111111111',
      assetAddress: '0x0000000000000000000000000000000000000000',
      roundId: 1,
      confirmations: 64,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('snapshot_not_ready');
      expect(result.candidateSnapshotBlock).toBe(1000);
      expect(result.indexedThroughBlock).toBe(1010);
      expect(result.requiredConfirmations).toBe(64);
    }
  });

  it('reuses persisted snapshot block', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('holder_reward_worker_rounds')) {
          return {
            rows: [
              {
                chain_id: '4663',
                vault_address: '0x1111111111111111111111111111111111111111',
                token_address: '0x2222222222222222222222222222222222222222',
                round_id: '1',
                asset_address: '0x0000000000000000000000000000000000000000',
                snapshot_block: '900',
                hour_end_unix: '7200',
                merkle_root: null,
                reward_amount_raw: '0',
                eligible_supply_raw: null,
                leaf_count: 0,
                status: 'pending',
              },
            ],
          };
        }
        if (sql.includes('indexer_checkpoints')) {
          return { rows: [{ last_block_number: '2000' }] };
        }
        return { rows: [] };
      }),
    };
    const result = await resolveSnapshotBlock({
      db: db as never,
      chainId: 4663,
      vaultAddress: '0x1111111111111111111111111111111111111111',
      assetAddress: '0x0000000000000000000000000000000000000000',
      roundId: 1,
      confirmations: 64,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshotBlock).toBe(900);
      expect(result.persisted).toBe(true);
    }
  });
});
