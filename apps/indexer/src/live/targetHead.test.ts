import { describe, expect, it, vi } from 'vitest';
import {
  confirmationStatusForBlock,
  confirmationRank,
  shouldPromote,
  promoteConfirmations,
  type ConfirmationHeads,
} from './confirmations.js';
import {
  DEFAULT_FIXED_LAG_BLOCKS,
  resolveConfirmLagBlocks,
  resolveTargetHead,
} from './targetHead.js';
import { findReorgFromBlock, deleteFactsFromBlock, handleReorgIfNeeded } from './reorg.js';

describe('resolveTargetHead', () => {
  const heads: ConfirmationHeads = {
    latest: 1000n,
    safe: 200n,
    finalized: 100n,
  };

  it('safe mode targets safe', () => {
    expect(resolveTargetHead({ mode: 'safe', heads })).toBe(200n);
  });

  it('finalized mode targets finalized', () => {
    expect(resolveTargetHead({ mode: 'finalized', heads })).toBe(100n);
  });

  it('latest mode targets latest', () => {
    expect(resolveTargetHead({ mode: 'latest', heads })).toBe(1000n);
  });

  it('fixed-lag uses latest - lag', () => {
    expect(
      resolveTargetHead({ mode: 'fixed-lag', heads, confirmLagBlocks: 16 }),
    ).toBe(984n);
  });

  it('fixed-lag defaults lag to 16 when unset', () => {
    expect(resolveConfirmLagBlocks('fixed-lag', undefined)).toBe(DEFAULT_FIXED_LAG_BLOCKS);
    expect(resolveTargetHead({ mode: 'fixed-lag', heads })).toBe(1000n - 16n);
  });

  it('fixed-lag floors at 0 when latest < lag', () => {
    expect(
      resolveTargetHead({
        mode: 'fixed-lag',
        heads: { latest: 8n, safe: 0n, finalized: 0n },
        confirmLagBlocks: 16,
      }),
    ).toBe(0n);
  });
});

describe('confirmation lifecycle', () => {
  const heads: ConfirmationHeads = {
    latest: 1000n,
    safe: 900n,
    finalized: 800n,
  };

  it('labels tip blocks pending, safe confirmed, finalized finalized', () => {
    expect(confirmationStatusForBlock(950n, heads)).toBe('pending');
    expect(confirmationStatusForBlock(900n, heads)).toBe('confirmed');
    expect(confirmationStatusForBlock(800n, heads)).toBe('finalized');
  });

  it('promotes monotonically only', () => {
    expect(shouldPromote('pending', 'confirmed')).toBe(true);
    expect(shouldPromote('confirmed', 'finalized')).toBe(true);
    expect(shouldPromote('finalized', 'confirmed')).toBe(false);
    expect(confirmationRank('pending')).toBeLessThan(confirmationRank('confirmed'));
  });
});

describe('promoteConfirmations — no duplicate projections', () => {
  it('UPDATE-only status promotion; does not insert trades', async () => {
    const calls: Array<{ sql: string }> = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        calls.push({ sql });
        if (sql.includes('SAVEPOINT') || sql.includes('RELEASE') || sql.includes('ROLLBACK')) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 2, rows: [] };
      }),
    };

    const result = await promoteConfirmations(db as never, {
      chainId: 4663,
      heads: { latest: 1000n, safe: 900n, finalized: 800n },
    });

    expect(result.rawUpdated).toBeGreaterThan(0);
    expect(calls.some((c) => c.sql.trimStart().startsWith('UPDATE'))).toBe(true);
    expect(calls.some((c) => /\bINSERT\b/i.test(c.sql))).toBe(false);
  });
});

describe('reorg helpers', () => {
  it('finds first hash mismatch', () => {
    const result = findReorgFromBlock(
      [
        { blockNumber: 10n, blockHash: `0x${'1'.repeat(64)}` },
        { blockNumber: 11n, blockHash: `0x${'2'.repeat(64)}` },
      ],
      [
        { blockNumber: 10n, blockHash: `0x${'1'.repeat(64)}` },
        { blockNumber: 11n, blockHash: `0x${'3'.repeat(64)}` },
      ],
    );
    expect(result.mismatch).toBe(true);
    expect(result.reorgFromBlock).toBe(11n);
  });

  it('deleteFactsFromBlock removes trades/transfers/raw', async () => {
    const deleted: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        deleted.push(sql);
        return { rowCount: 1, rows: [] };
      }),
    };
    await deleteFactsFromBlock(db as never, 4663, 50n);
    expect(deleted.some((s) => s.includes('DELETE FROM trades'))).toBe(true);
    expect(deleted.some((s) => s.includes('DELETE FROM transfers'))).toBe(true);
    expect(deleted.some((s) => s.includes('DELETE FROM raw_chain_events'))).toBe(true);
    expect(deleted.some((s) => s.includes('DELETE FROM processed_blocks'))).toBe(true);
  });

  it('handleReorgIfNeeded rebuilds candles/holders and clears market when no trades remain', async () => {
    const sqlLog: string[] = [];
    const db = {
      query: vi.fn(async (sql: string) => {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        sqlLog.push(normalized);

        if (normalized.includes('FROM processed_blocks') && normalized.includes('block_number >=')) {
          return {
            rows: [
              {
                chain_id: '4663',
                block_number: '100',
                block_hash: `0x${'a'.repeat(64)}`,
                parent_hash: null,
                block_timestamp: null,
              },
              {
                chain_id: '4663',
                block_number: '101',
                block_hash: `0x${'b'.repeat(64)}`,
                parent_hash: null,
                block_timestamp: null,
              },
            ],
          };
        }
        if (normalized.includes('DISTINCT token_address, pool_id')) {
          return {
            rows: [
              {
                token_address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
                pool_id: `0x${'e'.repeat(64)}`,
              },
            ],
          };
        }
        if (normalized.includes('FROM launches') && normalized.includes('tick_lower')) {
          return {
            rows: [
              {
                tick_lower: -100,
                tick_upper: 100,
                opening_sqrt_price_x96: '1',
                pool_id: `0x${'e'.repeat(64)}`,
                factory_address: `0x${'1'.repeat(40)}`,
                liquidity_locker_address: `0x${'2'.repeat(40)}`,
                fee_distributor_address: `0x${'3'.repeat(40)}`,
                quote_asset: `0x${'0'.repeat(40)}`,
              },
            ],
          };
        }
        if (normalized.includes('FROM indexer_checkpoints')) {
          return {
            rows: [
              {
                chain_id: '4663',
                stream_name: 'main',
                last_block_number: '101',
                last_block_hash: `0x${'b'.repeat(64)}`,
                last_log_index: 0,
              },
            ],
          };
        }
        // Remaining trades/transfers after fact delete — empty → clear market.
        if (normalized.includes('FROM trades') && normalized.includes('ORDER BY block_number')) {
          return { rows: [] };
        }
        if (normalized.includes('FROM transfers') && normalized.includes('ORDER BY')) {
          return { rows: [] };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    const result = await handleReorgIfNeeded(db as never, {
      chainId: 4663,
      windowBlocks: 128,
      latestIndexed: 101n,
      quoteUsdMaxAgeSeconds: 300,
      fetchCanonicalHashes: async () => [
        { blockNumber: 100n, blockHash: `0x${'a'.repeat(64)}` },
        { blockNumber: 101n, blockHash: `0x${'c'.repeat(64)}` },
      ],
    });

    expect(result.reorg).toBe(true);
    expect(result.replayFrom).toBe(100n);
    expect(sqlLog.some((s) => s.includes('DELETE FROM trades'))).toBe(true);
    expect(sqlLog.some((s) => s.includes('DELETE FROM candles'))).toBe(true);
    expect(sqlLog.some((s) => s.includes('DELETE FROM holder_balances'))).toBe(true);
    expect(sqlLog.some((s) => s.includes('DELETE FROM token_market_state'))).toBe(true);
    expect(sqlLog.some((s) => s.includes('INSERT INTO indexer_checkpoints'))).toBe(true);
  });
});
