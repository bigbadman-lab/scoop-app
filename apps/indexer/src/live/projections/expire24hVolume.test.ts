import { describe, expect, it, vi } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import {
  listMarketsNeeding24hRefresh,
  maybeExpireStale24hVolume,
  refreshStale24hMarketWindows,
  type Stale24hMarketCandidate,
} from './expire24hVolume.js';
import { MARKET_VOLUME_24H_WINDOW_SECONDS } from './market.js';

const IDLE = '0x1111111111111111111111111111111111111111';
const ACTIVE = '0x2222222222222222222222222222222222222222';
const POOL_IDLE =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const POOL_ACTIVE =
  '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const TX = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

function candidate(
  token: string,
  poolId: string,
): Stale24hMarketCandidate {
  return {
    tokenAddress: token,
    poolId,
    tickLower: -100,
    tickUpper: 100,
    openingSqrtPriceX96: 1n,
    liquidityRaw: 10n,
    sqrtPriceX96: 1n,
    tick: 0,
    sourceBlock: 1n,
    sourceTxHash: TX,
    sourceLogIndex: 0,
    quoteAsset: ZERO_ADDRESS,
    tokenIsCurrency1: true,
  };
}

describe('expire24hVolume sweep', () => {
  it('selects only markets with non-zero materialized 24h fields', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toContain('volume_24h_quote_raw');
        expect(sql).toContain('trade_count_24h');
        return {
          rows: [
            {
              token_address: IDLE,
              pool_id: POOL_IDLE,
              tick_lower: -100,
              tick_upper: 100,
              opening_sqrt_price_x96: '1',
              liquidity_raw: '10',
              sqrt_price_x96: '1',
              tick: 0,
              source_block: '9',
              source_tx_hash: TX,
              source_log_index: 0,
              quote_asset: ZERO_ADDRESS,
              currency1: IDLE,
              last_trade_sqrt: '2',
              last_trade_tick: 1,
              last_trade_liq: '11',
              last_trade_block: '9',
              last_trade_tx: TX,
              last_trade_log: 3,
            },
          ],
        };
      }),
    };

    const rows = await listMarketsNeeding24hRefresh(db as never, 4663);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenAddress).toBe(IDLE);
    expect(rows[0]?.sqrtPriceX96).toBe(2n);
    expect(rows[0]?.tokenIsCurrency1).toBe(true);
  });

  it('skips incomplete rows instead of BigInt(null) (production crash repro)', async () => {
    // Production: after each fast-catchup batch, maybeExpireStale24hVolume lists
    // candidates. Sparse/Pump markets can have null sqrt/liquidity while still
    // matching the non-zero 24h WHERE clause. Pre-fix BigInt(null) killed the runner.
    expect(() => BigInt(null as never)).toThrow(/Cannot convert null to a BigInt/);

    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            token_address: IDLE,
            pool_id: POOL_IDLE,
            tick_lower: -100,
            tick_upper: 100,
            opening_sqrt_price_x96: '1',
            liquidity_raw: null,
            sqrt_price_x96: null,
            tick: 0,
            source_block: null,
            source_tx_hash: null,
            source_log_index: null,
            quote_asset: ZERO_ADDRESS,
            currency1: IDLE,
            last_trade_sqrt: null,
            last_trade_tick: null,
            last_trade_liq: null,
            last_trade_block: null,
            last_trade_tx: null,
            last_trade_log: null,
          },
          {
            token_address: ACTIVE,
            pool_id: POOL_ACTIVE,
            tick_lower: -100,
            tick_upper: 100,
            opening_sqrt_price_x96: '5',
            liquidity_raw: '10',
            sqrt_price_x96: '7',
            tick: 2,
            source_block: '42',
            source_tx_hash: TX,
            source_log_index: 1,
            quote_asset: ZERO_ADDRESS,
            currency1: ACTIVE,
            last_trade_sqrt: null,
            last_trade_tick: null,
            last_trade_liq: null,
            last_trade_block: null,
            last_trade_tx: null,
            last_trade_log: null,
          },
        ],
      })),
    };

    const rows = await listMarketsNeeding24hRefresh(db as never, 4663);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenAddress).toBe(ACTIVE);
    expect(rows[0]?.sqrtPriceX96).toBe(7n);
    expect(rows[0]?.sourceBlock).toBe(42n);
    expect(rows[0]?.sourceLogIndex).toBe(1);
  });

  it('post-batch sweep with null candidate fields does not throw (multi-batch survivor)', async () => {
    const db = {
      query: vi.fn(async () => ({
        rows: [
          {
            token_address: IDLE,
            pool_id: POOL_IDLE,
            tick_lower: -50,
            tick_upper: 50,
            opening_sqrt_price_x96: null,
            liquidity_raw: null,
            sqrt_price_x96: null,
            tick: null,
            source_block: null,
            source_tx_hash: null,
            source_log_index: null,
            quote_asset: ZERO_ADDRESS,
            currency1: null,
            last_trade_sqrt: null,
            last_trade_tick: null,
            last_trade_liq: null,
            last_trade_block: null,
            last_trade_tx: null,
            last_trade_log: null,
          },
        ],
      })),
    };

    // Simulate runner: lastSweepAtMs=0 ⇒ first post-batch sweep always due.
    const first = await maybeExpireStale24hVolume({
      db: db as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSweepAtMs: 0,
      nowMs: 60_000,
    });
    expect(first.swept).toBe(true);
    expect(first.candidates).toBe(0);
    expect(first.failed).toBe(0);

    const second = await maybeExpireStale24hVolume({
      db: db as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSweepAtMs: first.nextLastAtMs,
      nowMs: first.nextLastAtMs + 60_000,
    });
    expect(second.swept).toBe(true);
    expect(second.candidates).toBe(0);
  });

  it('idle market refresh without a new trade uses wall-clock nowSec', async () => {
    const nowSec = 1_700_100_000;
    const refreshOne = vi.fn(async () => undefined);
    const listCandidates = vi.fn(async () => [candidate(IDLE, POOL_IDLE)]);

    const outcome = await refreshStale24hMarketWindows({} as never, {
      chainId: 4663,
      nowSec,
      refreshOne: refreshOne as never,
      listCandidates: listCandidates as never,
    });

    expect(outcome.candidates).toBe(1);
    expect(outcome.refreshed).toBe(1);
    expect(outcome.failed).toBe(0);
    expect(refreshOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tokenAddress: IDLE,
        nowSec,
      }),
    );
  });

  it('repeated sweep is idempotent (same nowSec → same refresh args)', async () => {
    const nowSec = 1_700_200_000;
    const refreshOne = vi.fn(async () => undefined);
    const listCandidates = vi.fn(async () => [candidate(IDLE, POOL_IDLE)]);

    const first = await refreshStale24hMarketWindows({} as never, {
      chainId: 4663,
      nowSec,
      refreshOne: refreshOne as never,
      listCandidates: listCandidates as never,
    });
    const second = await refreshStale24hMarketWindows({} as never, {
      chainId: 4663,
      nowSec,
      refreshOne: refreshOne as never,
      listCandidates: listCandidates as never,
    });

    expect(first).toEqual(second);
    expect(refreshOne).toHaveBeenCalledTimes(2);
    expect(refreshOne.mock.calls[0]?.[1]).toMatchObject({ nowSec });
    expect(refreshOne.mock.calls[1]?.[1]).toMatchObject({ nowSec });
  });

  it('multiple markets: one failure does not abort the other', async () => {
    const refreshOne = vi.fn(async (_db: unknown, args: { tokenAddress: string }) => {
      if (args.tokenAddress === IDLE) {
        throw new Error('boom');
      }
    });
    const listCandidates = vi.fn(async () => [
      candidate(IDLE, POOL_IDLE),
      candidate(ACTIVE, POOL_ACTIVE),
    ]);

    const outcome = await refreshStale24hMarketWindows({} as never, {
      chainId: 4663,
      nowSec: 1_700_300_000,
      refreshOne: refreshOne as never,
      listCandidates: listCandidates as never,
    });

    expect(outcome.candidates).toBe(2);
    expect(outcome.refreshed).toBe(1);
    expect(outcome.failed).toBe(1);
    expect(outcome.results.find((r) => r.tokenAddress === IDLE)?.ok).toBe(false);
    expect(outcome.results.find((r) => r.tokenAddress === ACTIVE)?.ok).toBe(true);
  });

  it('interval gate skips until SCOOP_VOLUME_24H_SWEEP_SECONDS elapses', async () => {
    const refreshOne = vi.fn(async () => undefined);
    const listCandidates = vi.fn(async () => [candidate(IDLE, POOL_IDLE)]);

    // Force internal path by stubbing via direct maybeExpire with mocked refresh through
    // a thin db that returns no candidates (interval skip happens before list).
    const early = await maybeExpireStale24hVolume({
      db: { query: vi.fn() } as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSweepAtMs: 1_000_000,
      nowMs: 1_000_000 + 30_000,
    });
    expect(early.swept).toBe(false);
    expect(early.nextLastAtMs).toBe(1_000_000);
    expect(early.windowSeconds).toBe(MARKET_VOLUME_24H_WINDOW_SECONDS);

    // After interval: empty candidate set still counts as swept.
    const due = await maybeExpireStale24hVolume({
      db: {
        query: vi.fn(async () => ({ rows: [] })),
      } as never,
      chainId: 4663,
      intervalSeconds: 60,
      lastSweepAtMs: 1_000_000,
      nowMs: 1_000_000 + 60_000,
    });
    expect(due.swept).toBe(true);
    expect(due.nextLastAtMs).toBe(1_000_000 + 60_000);
    expect(due.candidates).toBe(0);
    expect(refreshOne).not.toHaveBeenCalled();
    expect(listCandidates).not.toHaveBeenCalled();
  });

  it('active + idle candidates are both refreshed in one sweep', async () => {
    const seen: string[] = [];
    const refreshOne = vi.fn(async (_db: unknown, args: { tokenAddress: string }) => {
      seen.push(args.tokenAddress);
    });
    const listCandidates = vi.fn(async () => [
      candidate(IDLE, POOL_IDLE),
      candidate(ACTIVE, POOL_ACTIVE),
    ]);

    const outcome = await refreshStale24hMarketWindows({} as never, {
      chainId: 4663,
      nowSec: 1_700_400_000,
      refreshOne: refreshOne as never,
      listCandidates: listCandidates as never,
    });

    expect(outcome.refreshed).toBe(2);
    expect(seen).toEqual([IDLE, ACTIVE]);
  });
});
