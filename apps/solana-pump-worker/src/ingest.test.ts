import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NormalizedPumpTradeEvent } from './provider/types.js';
import { SCOOP_SUPPORT_WALLET } from '@scoop/shared';

const upsertPumpTrade = vi.fn();
const applyPumpCandleTrade = vi.fn();
const refreshPumpMarketStateFromTrades = vi.fn();
const upsertPumpWorkerCheckpoint = vi.fn();
const upsertScoopSupportBuy = vi.fn();
const isQualifyingScoopSupportBuy = vi.fn();
const computePumpFdvSol = vi.fn(() => '1000');
const pumpCandleBucketStart = vi.fn(() => new Date('2026-09-21T12:00:00.000Z'));

vi.mock('@scoop/db', () => ({
  PUMP_CANDLE_INTERVALS: ['1m', '5m', '1h'],
  PUMP_MARKET_CHAIN_ID: 900001,
  upsertPumpTrade: (...args: unknown[]) => upsertPumpTrade(...args),
  applyPumpCandleTrade: (...args: unknown[]) => applyPumpCandleTrade(...args),
  refreshPumpMarketStateFromTrades: (...args: unknown[]) =>
    refreshPumpMarketStateFromTrades(...args),
  upsertPumpWorkerCheckpoint: (...args: unknown[]) => upsertPumpWorkerCheckpoint(...args),
  upsertScoopSupportBuy: (...args: unknown[]) => upsertScoopSupportBuy(...args),
  isQualifyingScoopSupportBuy: (...args: unknown[]) => isQualifyingScoopSupportBuy(...args),
  computePumpFdvSol: (...args: unknown[]) => computePumpFdvSol(...args),
  pumpCandleBucketStart: (...args: unknown[]) => pumpCandleBucketStart(...args),
  withTransaction: async (_pool: unknown, fn: (c: unknown) => Promise<unknown>) => fn({}),
}));

import { ingestNormalizedPumpTrade } from './ingest.js';

function sampleEvent(overrides: Partial<NormalizedPumpTradeEvent> = {}): NormalizedPumpTradeEvent {
  return {
    mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    signature: '5'.repeat(64),
    eventIndex: 0,
    slot: 42,
    blockTime: new Date('2026-09-21T12:00:00.000Z'),
    side: 'buy',
    wallet: 'So11111111111111111111111111111111111111112',
    tokenAmountRaw: '1000000',
    tokenAmount: '1',
    solAmountLamports: '500000000',
    solAmount: '0.5',
    priceSol: '0.5',
    source: 'alchemy',
    curveAddress: null,
    ...overrides,
  };
}

describe('ingestNormalizedPumpTrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertPumpTrade.mockResolvedValue({ inserted: true });
    applyPumpCandleTrade.mockResolvedValue(undefined);
    refreshPumpMarketStateFromTrades.mockResolvedValue({});
    upsertPumpWorkerCheckpoint.mockResolvedValue({});
    upsertScoopSupportBuy.mockResolvedValue({ inserted: true });
    isQualifyingScoopSupportBuy.mockReturnValue(false);
  });

  it('persists a valid buy and updates candles/state/checkpoint', async () => {
    const result = await ingestNormalizedPumpTrade(
      {
        pool: {} as never,
        resolveWatchItem: () =>
          ({
            chainId: 900001,
            mint: sampleEvent().mint,
            signature: 'x',
            creator: 'y',
            launchedAt: null,
            name: 'T',
            symbol: 'T',
            imageUri: '',
            totalSupplyRaw: '1000000000000000',
            decimals: 6,
          }) as never,
      },
      sampleEvent({ side: 'buy' }),
    );
    expect(result).toEqual({ ok: true, inserted: true });
    expect(upsertPumpTrade).toHaveBeenCalledTimes(1);
    expect(applyPumpCandleTrade).toHaveBeenCalledTimes(3);
    expect(refreshPumpMarketStateFromTrades).toHaveBeenCalledTimes(1);
    expect(upsertPumpWorkerCheckpoint).toHaveBeenCalledTimes(1);
    expect(computePumpFdvSol).toHaveBeenCalled();
    expect(upsertScoopSupportBuy).not.toHaveBeenCalled();
  });

  it('persists a support-wallet buy into scoop_support_buys', async () => {
    isQualifyingScoopSupportBuy.mockReturnValue(true);
    const event = sampleEvent({
      wallet: SCOOP_SUPPORT_WALLET,
      side: 'buy',
      solAmountLamports: '420000000',
      solAmount: '0.42',
    });
    const result = await ingestNormalizedPumpTrade(
      {
        pool: {} as never,
        resolveWatchItem: () =>
          ({
            chainId: 900001,
            mint: event.mint,
            signature: 'x',
            creator: 'y',
            launchedAt: null,
            name: 'T',
            symbol: 'T',
            imageUri: '',
            totalSupplyRaw: '1000000000000000',
            decimals: 6,
          }) as never,
      },
      event,
    );
    expect(result).toEqual({ ok: true, inserted: true });
    expect(upsertScoopSupportBuy).toHaveBeenCalledTimes(1);
    expect(upsertScoopSupportBuy.mock.calls[0]?.[1]).toMatchObject({
      mint: event.mint,
      signature: event.signature,
      supportWallet: SCOOP_SUPPORT_WALLET,
      solAmountLamports: '420000000',
      source: 'alchemy',
    });
  });

  it('does not write support buys for sells even from the support wallet', async () => {
    isQualifyingScoopSupportBuy.mockReturnValue(false);
    await ingestNormalizedPumpTrade(
      { pool: {} as never },
      sampleEvent({ wallet: SCOOP_SUPPORT_WALLET, side: 'sell' }),
    );
    expect(upsertScoopSupportBuy).not.toHaveBeenCalled();
  });

  it('persists a valid sell', async () => {
    const result = await ingestNormalizedPumpTrade(
      { pool: {} as never },
      sampleEvent({ side: 'sell', eventIndex: 1 }),
    );
    expect(result).toEqual({ ok: true, inserted: true });
    expect(upsertPumpTrade.mock.calls[0]?.[1]?.side).toBe('sell');
  });

  it('is idempotent on duplicate events', async () => {
    upsertPumpTrade.mockResolvedValue({ inserted: false });
    const result = await ingestNormalizedPumpTrade(
      { pool: {} as never },
      sampleEvent(),
    );
    expect(result).toEqual({ ok: true, inserted: false, reason: 'duplicate' });
    expect(applyPumpCandleTrade).not.toHaveBeenCalled();
    expect(refreshPumpMarketStateFromTrades).not.toHaveBeenCalled();
    expect(upsertScoopSupportBuy).not.toHaveBeenCalled();
  });

  it('rejects malformed events', async () => {
    const result = await ingestNormalizedPumpTrade(
      { pool: {} as never },
      sampleEvent({ mint: '0xabc' }),
    );
    expect(result.ok).toBe(false);
    expect(upsertPumpTrade).not.toHaveBeenCalled();
  });

  it('accepts out-of-order slots safely (still inserts when unique)', async () => {
    const result = await ingestNormalizedPumpTrade(
      { pool: {} as never },
      sampleEvent({ slot: 1, eventIndex: 9 }),
    );
    expect(result).toEqual({ ok: true, inserted: true });
  });
});
