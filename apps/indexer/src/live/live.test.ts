import { describe, expect, it } from 'vitest';
import { FailoverRpc } from '../live/rpc/failover.js';
import { findReorgFromBlock } from '../live/reorg.js';
import {
  confirmationStatusForBlock,
  shouldPromote,
  confirmationRank,
} from '../live/confirmations.js';
import {
  mergeTradeIntoMinuteCandle,
  rollupMinuteCandles,
  bucketStartFor,
} from '../live/projections/candles.js';
import { watchlistAddLaunch, watchlistSize, type Watchlist } from '../live/watchlist.js';
import { mapCreditSourceToToken } from '../live/projections/creators.js';
import { loadConfig, publicConfigView } from '../config.js';
import { ZERO_ADDRESS } from '@scoop/shared';

describe('config 6A.6', () => {
  it('defaults indexing off and exposes new knobs', () => {
    const config = loadConfig({ SCOOP_CHAIN_ID: '4663' });
    expect(config.SCOOP_INDEXING_ENABLED).toBe(false);
    expect(config.SCOOP_NEW_WINDOW_SECONDS).toBe(86400);
    expect(config.SCOOP_SOON_THRESHOLD_BPS).toBe(8000);
    expect(config.SCOOP_REORG_WINDOW_BLOCKS).toBe(128);
    expect(config.SCOOP_POLL_INTERVAL_MS).toBe(2000);
    expect(config.SCOOP_MAX_BLOCK_BATCH).toBe(20);
    expect(config.SCOOP_LAUNCH_DUST_RAW).toBe(1000n);
    expect(publicConfigView(config).hasDatabaseUrl).toBe(false);
  });

  it('requires DATABASE_URL when indexing enabled', () => {
    expect(() =>
      loadConfig({
        SCOOP_CHAIN_ID: '4663',
        SCOOP_INDEXING_ENABLED: 'true',
        ROBINHOOD_RPC_URL: 'https://example.com',
      }),
    ).toThrow(/DATABASE_URL/);
  });
});

describe('failover selection', () => {
  it('uses primary then falls back after failures', () => {
    const rpc = new FailoverRpc({
      primaryUrl: 'https://primary.example',
      fallbackUrl: 'https://fallback.example',
      failureThreshold: 2,
      primaryRetryMs: 60_000,
    });
    expect(rpc.activeSlot()).toBe('primary');
    rpc.recordFailure();
    expect(rpc.activeSlot()).toBe('primary');
    rpc.recordFailure();
    expect(rpc.activeSlot()).toBe('fallback');
    expect(rpc.selectSlot(0)).toBe('fallback');
    expect(rpc.selectSlot(Date.now() + 60_000)).toBe('primary');
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

  it('reports no mismatch when hashes align', () => {
    const hash = `0x${'a'.repeat(64)}`;
    expect(
      findReorgFromBlock([{ blockNumber: 1n, blockHash: hash }], [
        { blockNumber: 1n, blockHash: hash },
      ]),
    ).toEqual({ mismatch: false, reorgFromBlock: null });
  });
});

describe('confirmations', () => {
  const heads = { latest: 100n, safe: 90n, finalized: 80n };

  it('classifies pending/confirmed/finalized', () => {
    expect(confirmationStatusForBlock(95n, heads)).toBe('pending');
    expect(confirmationStatusForBlock(85n, heads)).toBe('confirmed');
    expect(confirmationStatusForBlock(70n, heads)).toBe('finalized');
  });

  it('promotes monotonically', () => {
    expect(shouldPromote('pending', 'confirmed')).toBe(true);
    expect(shouldPromote('confirmed', 'pending')).toBe(false);
    expect(shouldPromote('finalized', 'confirmed')).toBe(false);
    expect(confirmationRank('finalized')).toBeGreaterThan(confirmationRank('pending'));
  });
});

describe('candle rollup', () => {
  it('merges trades and rolls 1m → 5m', () => {
    const b0 = bucketStartFor('1m', 1_700_000_000);
    let c = mergeTradeIntoMinuteCandle(null, {
      priceQuoteX18: 100n,
      quoteAmountRaw: 1n,
      tokenAmountRaw: 2n,
      side: 'buy',
      blockNumber: 1,
      bucketStart: b0,
    });
    c = mergeTradeIntoMinuteCandle(c, {
      priceQuoteX18: 120n,
      quoteAmountRaw: 3n,
      tokenAmountRaw: 4n,
      side: 'sell',
      blockNumber: 2,
      bucketStart: b0,
    });
    expect(c.openQuoteX18).toBe(100n);
    expect(c.closeQuoteX18).toBe(120n);
    expect(c.highQuoteX18).toBe(120n);
    expect(c.tradeCount).toBe(2);

    const m2 = mergeTradeIntoMinuteCandle(null, {
      priceQuoteX18: 110n,
      quoteAmountRaw: 1n,
      tokenAmountRaw: 1n,
      side: 'buy',
      blockNumber: 3,
      bucketStart: b0 + 60,
    });
    const rolled = rollupMinuteCandles([c, m2], '5m');
    expect(rolled).toHaveLength(1);
    expect(rolled[0]!.tradeCount).toBe(3);
    expect(rolled[0]!.openQuoteX18).toBe(100n);
    expect(rolled[0]!.closeQuoteX18).toBe(110n);
  });
});

describe('watchlist', () => {
  it('adds launches dynamically and maps distributor → token', () => {
    const wl: Watchlist = {
      tokens: new Map(),
      pools: new Map(),
      distributors: new Map(),
      lockers: new Set(),
      tokenAddresses: [],
      distributorAddresses: [],
    };
    const entry = watchlistAddLaunch(wl, {
      chainId: 4663,
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      poolId: `0x${'e'.repeat(64)}`,
      feeDistributorAddress: '0x187e2c017bcc52094a9086abac94dde7b680a988',
      liquidityLockerAddress: '0xaa8445659a2424ee1ba33c232ec05569c975193f',
      quoteAsset: ZERO_ADDRESS,
      factoryAddress: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
      deployerAddress: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
      creatorId: `0x${'f'.repeat(64)}`,
      tickLower: -887270,
      tickUpper: 200260,
      openingSqrtPriceX96: '1',
      lpTokenId: '1',
      currency0: ZERO_ADDRESS,
      currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      fee: 10000,
      tickSpacing: 10,
      hooks: ZERO_ADDRESS,
    });
    expect(watchlistSize(wl)).toBe(1);
    expect(mapCreditSourceToToken(wl, entry.feeDistributorAddress)).toBe(entry.tokenAddress);
  });
});

describe('duplicate replay keys', () => {
  it('trade natural key is chain+tx+logIndex', () => {
    const key = (chainId: number, tx: string, logIndex: number) =>
      `${chainId}:${tx.toLowerCase()}:${logIndex}`;
    const a = key(4663, `0x${'b'.repeat(64)}`, 62);
    const b = key(4663, `0x${'B'.repeat(64)}`, 62);
    expect(a).toBe(b);
  });
});
