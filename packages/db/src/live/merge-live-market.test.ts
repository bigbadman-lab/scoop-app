import { describe, expect, it } from 'vitest';
import type { TokenDetail, TokenDiscoveryItem, TradeItem } from '../dto.js';
import type { LiveTokenTip, LiveTrade } from '../repos/live-overlay.js';
import {
  applyLiveTipToTokenDetail,
  mergeLiveDiscoveryItems,
  mergeLiveTrades,
} from './merge-live-market.js';

const token = `0x${'1'.repeat(40)}`;
const pool = `0x${'2'.repeat(64)}`;
const tx = (digit: string) => `0x${digit.repeat(64)}`;
const future = '2999-01-01T00:00:00.000Z';
const past = '2000-01-01T00:00:00.000Z';

function discovery(overrides: Partial<TokenDiscoveryItem> = {}): TokenDiscoveryItem {
  return {
    chainId: 46630,
    tokenAddress: token,
    name: 'Scoop',
    symbol: 'SCP',
    decimals: 18,
    imageUri: 'ipfs://scoop',
    displayImageUrl: null,
    poolId: pool,
    creatorId: tx('3'),
    quoteAsset: `0x${'4'.repeat(40)}`,
    launchedAt: 100,
    ageSeconds: 10,
    launchProgressBps: 0,
    launchComplete: false,
    isNew: true,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: null,
    priceQuoteDisplay: null,
    priceUsdX18: null,
    priceUsdDisplay: null,
    fdvUsdX18: null,
    fdvUsdDisplay: null,
    volume24hQuoteRaw: null,
    volume24hQuoteDisplay: null,
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: null,
    tradeCountAllTime: null,
    buyCount24h: null,
    sellCount24h: null,
    holderCountAll: null,
    holderCountRetail: null,
    lastTradeAt: null,
    priceChange24hBps: null,
    ...overrides,
  };
}

function tip(overrides: Partial<LiveTokenTip> = {}): LiveTokenTip {
  return {
    chainId: 46630,
    tokenAddress: token,
    name: 'Scoop',
    symbol: 'SCP',
    decimals: 18,
    imageUri: 'ipfs://scoop',
    displayImageUrl: null,
    poolId: pool,
    quoteAsset: `0x${'4'.repeat(40)}`,
    creatorId: tx('3'),
    deployerAddress: `0x${'5'.repeat(40)}`,
    factoryAddress: `0x${'6'.repeat(40)}`,
    launchedAt: 100,
    launchTxHash: tx('7'),
    priceQuoteX18: '2000000000000000000',
    priceUsdX18: '4000000000000000000',
    fdvUsdX18: '4000000000000000000000',
    volume24hQuoteRaw: '10',
    volume24hUsdX18: '20',
    tradeCountDelta: 1,
    buyCountDelta: 1,
    sellCountDelta: 0,
    lastSide: 'buy',
    lastTradeAt: 120,
    sourceBlock: 110,
    sourceTxHash: tx('8'),
    sourceLogIndex: 2,
    updatedAt: '2026-09-14T00:00:00.000Z',
    expiresAt: future,
    totalSupplyRaw: '1000000000000000000000',
    ...overrides,
  };
}

function trade(overrides: Partial<TradeItem> = {}): TradeItem {
  return {
    chainId: 46630,
    txHash: tx('8'),
    logIndex: 2,
    blockNumber: 110,
    blockTimestamp: 120,
    tokenAddress: token,
    poolId: pool,
    side: 'buy',
    swapSender: `0x${'9'.repeat(40)}`,
    txFrom: null,
    traderAddress: null,
    traderAttributionType: 'unknown',
    quoteAmountRaw: '10',
    quoteAmountDisplay: '0.00000000000000001',
    tokenAmountRaw: '5',
    tokenAmountDisplay: '0.000000000000000005',
    executionPriceQuoteX18: '2000000000000000000',
    executionPriceQuoteDisplay: '2',
    quoteUsdX18: null,
    executionPriceUsdX18: null,
    executionPriceUsdDisplay: null,
    usdValueX18: null,
    usdValueDisplay: null,
    isInitialBuy: false,
    confirmationStatus: 'confirmed',
    ...overrides,
  };
}

function liveTrade(overrides: Partial<LiveTrade> = {}): LiveTrade {
  return {
    ...trade({ confirmationStatus: 'pending' }),
    source: 'live',
    observedAt: '2026-09-14T00:00:00.000Z',
    expiresAt: future,
    ...overrides,
  };
}

function detail(overrides: Partial<TokenDetail> = {}): TokenDetail {
  return {
    ...discovery(),
    description: '',
    twitter: '',
    telegram: '',
    discord: '',
    website: '',
    farcaster: '',
    totalSupplyRaw: '1000',
    totalSupplyDisplay: '0.000000000000001',
    deployerAddress: `0x${'5'.repeat(40)}`,
    factoryAddress: `0x${'6'.repeat(40)}`,
    feeDistributorAddress: '',
    liquidityLockerAddress: '',
    sqrtPriceX96: null,
    tick: null,
    liquidityRaw: null,
    quoteUsdX18: null,
    quoteVolumeAllTimeRaw: null,
    tokenVolumeAllTimeRaw: null,
    buyCountAllTime: null,
    sellCountAllTime: null,
    initialTokenInventoryRaw: null,
    currentTokenInventoryRaw: null,
    sourceBlock: 100,
    poolFee: null,
    currency0: null,
    currency1: null,
    tickSpacing: null,
    hooks: null,
    creatorFeesLifetimeEthRaw: null,
    creatorFeesLifetimeEthDisplay: null,
    buybackFeesLifetimeEthRaw: null,
    buybackFeesLifetimeEthDisplay: null,
    creatorFeeDistributions: [],
    buybackFeeDistributions: [],
    ...overrides,
  };
}

describe('live market merge', () => {
  it('shows a live launch before canonical indexing', () => {
    const merged = mergeLiveDiscoveryItems([], [tip()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.tokenAddress).toBe(token);
    const tipOnly = applyLiveTipToTokenDetail(null, tip());
    expect(tipOnly?.sourceBlock).toBe(110);
    expect(tipOnly?.creatorFeeDistributions).toEqual([]);
    expect(tipOnly?.buybackFeeDistributions).toEqual([]);
    expect(tipOnly?.creatorFeesLifetimeEthRaw).toBeNull();
    expect(tipOnly?.buybackFeesLifetimeEthRaw).toBeNull();
  });

  it('lets canonical token detail take over at the same source block', () => {
    const canonical = detail({ sourceBlock: 110, priceQuoteX18: '1' });
    expect(applyLiveTipToTokenDetail(canonical, tip())).toBe(canonical);
  });

  it('keeps a live display image when canonical displayImageUrl is null', () => {
    const displayImageUrl =
      'https://project.supabase.co/storage/v1/object/public/token-image/2hawk.png';
    const canonical = detail({
      sourceBlock: 110,
      displayImageUrl: null,
      imageUri: 'ipfs://canonical-2hawk',
    });

    expect(
      applyLiveTipToTokenDetail(
        canonical,
        tip({
          sourceBlock: 110,
          displayImageUrl,
          imageUri: 'ipfs://live-2hawk',
        }),
      ),
    ).toMatchObject({
      displayImageUrl,
      imageUri: 'ipfs://canonical-2hawk',
      priceQuoteX18: canonical.priceQuoteX18,
    });
  });

  it('lets a later confirmed HTTPS display image win over live display', () => {
    const confirmedDisplay = 'https://project.supabase.co/confirmed.png';
    const liveDisplay = 'https://ipfs.io/ipfs/bafy-live';
    const merged = mergeLiveDiscoveryItems(
      [discovery({ displayImageUrl: confirmedDisplay })],
      [tip({ displayImageUrl: liveDisplay })],
    );

    expect(merged[0]?.displayImageUrl).toBe(confirmedDisplay);
  });

  it('preserves the 2HAWK live IPFS image when canonical image fields are empty', () => {
    const canonical = detail({
      tokenAddress: '0x8292b1af08e0b2efbc0f383091d11ebed33bac5b',
      sourceBlock: 120,
      displayImageUrl: null,
      imageUri: '',
    });
    const live = tip({
      tokenAddress: canonical.tokenAddress,
      sourceBlock: 110,
      displayImageUrl: null,
      imageUri: 'ipfs://bafy-2hawk',
    });

    expect(applyLiveTipToTokenDetail(canonical, live)).toMatchObject({
      displayImageUrl: null,
      imageUri: 'ipfs://bafy-2hawk',
    });
  });

  it('overlays one live BUY above the canonical checkpoint', () => {
    const merged = mergeLiveTrades([], [liveTrade()], 109);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ side: 'buy', source: 'live' });
  });

  it('deduplicates the same tx hash and log index with canonical winning', () => {
    const canonical = trade();
    const merged = mergeLiveTrades([canonical], [liveTrade()], 100);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      confirmationStatus: 'confirmed',
      source: 'confirmed',
    });
  });

  it('filters expired live rows', () => {
    expect(mergeLiveTrades([], [liveTrade({ expiresAt: past })], null)).toEqual([]);
    expect(mergeLiveDiscoveryItems([], [tip({ expiresAt: past })])).toEqual([]);
  });

  it('returns confirmed data unchanged when live is unavailable', () => {
    const canonicalTrade = trade();
    const canonicalDetail = detail();
    expect(mergeLiveTrades([canonicalTrade], [], 100)[0]).toMatchObject(canonicalTrade);
    expect(applyLiveTipToTokenDetail(canonicalDetail, null)).toBe(canonicalDetail);
    expect(mergeLiveDiscoveryItems([discovery()], [])).toEqual([discovery()]);
  });

  it('does not add a duplicate live discovery item', () => {
    const merged = mergeLiveDiscoveryItems([discovery()], [tip()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      priceQuoteX18: '2000000000000000000',
      tradeCount24h: 1,
    });
  });

  it('adds only tip volume deltas on top of canonical volume', () => {
    const merged = mergeLiveDiscoveryItems(
      [discovery({ volume24hQuoteRaw: '100', tradeCount24h: 5 })],
      [tip({ volume24hQuoteRaw: '10', tradeCountDelta: 2 })],
    );
    expect(merged[0]).toMatchObject({
      volume24hQuoteRaw: '110',
      tradeCount24h: 7,
    });
  });
});
