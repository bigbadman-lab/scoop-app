import { formatRawAmount, formatX18 } from '../decimal.js';
import type { TokenDetail, TokenDiscoveryItem, TradeItem } from '../dto.js';
import type { LiveTokenTip, LiveTrade } from '../repos/live-overlay.js';

export type LiveAnnotated<T> = T & { source?: 'live' | 'confirmed' };

function key(item: { txHash: string; logIndex: number }): string {
  return `${item.txHash.toLowerCase()}:${item.logIndex}`;
}

function isFresh(item: { expiresAt: string }, nowMs = Date.now()): boolean {
  const expiresAt = Date.parse(item.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

function addNumericStrings(left: string | null, right: string | null): string | null {
  if (right == null) return left;
  try {
    return (BigInt(left ?? '0') + BigInt(right)).toString();
  } catch {
    return left;
  }
}

function addNullableNumber(left: number | null, right: number): number | null {
  if (right === 0) return left;
  return (left ?? 0) + right;
}

function validPublicImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

function validImageUri(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^ipfs:\/\//i.test(trimmed)) return trimmed;
  return validPublicImageUrl(trimmed);
}

function bestImageFields(
  canonical: Pick<TokenDiscoveryItem, 'displayImageUrl' | 'imageUri'>,
  tip: Pick<LiveTokenTip, 'displayImageUrl' | 'imageUri'>,
): Pick<TokenDiscoveryItem, 'displayImageUrl' | 'imageUri'> {
  return {
    displayImageUrl:
      validPublicImageUrl(canonical.displayImageUrl) ?? validPublicImageUrl(tip.displayImageUrl),
    imageUri: validImageUri(canonical.imageUri) ?? validImageUri(tip.imageUri) ?? '',
  };
}

function liveDiscoveryItem(tip: LiveTokenTip, nowSec: number): TokenDiscoveryItem | null {
  if (
    !tip.name ||
    !tip.symbol ||
    tip.decimals == null ||
    !tip.poolId ||
    !tip.quoteAsset ||
    !tip.creatorId ||
    tip.launchedAt == null
  ) {
    return null;
  }
  const volumeQuote = tip.volume24hQuoteRaw;
  const ageSeconds = Math.max(0, nowSec - tip.launchedAt);
  const images = bestImageFields({ displayImageUrl: null, imageUri: '' }, tip);
  return {
    chainId: tip.chainId,
    tokenAddress: tip.tokenAddress,
    name: tip.name,
    symbol: tip.symbol,
    decimals: tip.decimals,
    imageUri: images.imageUri,
    displayImageUrl: images.displayImageUrl,
    marketSource: 'scoop',
    marketPhase: null,
    poolId: tip.poolId,
    curveAddress: null,
    creatorId: tip.creatorId,
    quoteAsset: tip.quoteAsset,
    launchedAt: tip.launchedAt,
    ageSeconds,
    launchProgressBps: 0,
    launchComplete: false,
    isNew: ageSeconds <= 86_400,
    isSoon: false,
    isBonded: false,
    priceQuoteX18: tip.priceQuoteX18,
    priceQuoteDisplay: formatX18(tip.priceQuoteX18),
    priceUsdX18: tip.priceUsdX18,
    priceUsdDisplay: formatX18(tip.priceUsdX18),
    fdvUsdX18: tip.fdvUsdX18,
    fdvUsdDisplay: formatX18(tip.fdvUsdX18),
    volume24hQuoteRaw: volumeQuote,
    volume24hQuoteDisplay: volumeQuote == null ? null : formatRawAmount(volumeQuote, 18),
    volume24hUsdX18: tip.volume24hUsdX18,
    volume24hUsdDisplay: formatX18(tip.volume24hUsdX18),
    tradeCount24h: tip.tradeCountDelta,
    tradeCountAllTime: tip.tradeCountDelta,
    buyCount24h: tip.buyCountDelta,
    sellCount24h: tip.sellCountDelta,
    holderCountAll: null,
    holderCountRetail: null,
    lastTradeAt: tip.lastTradeAt,
    priceChange24hBps: null,
    loreTitle: null,
  };
}

function overlayDiscovery(canonical: TokenDiscoveryItem, tip: LiveTokenTip): TokenDiscoveryItem {
  const volumeQuote = addNumericStrings(canonical.volume24hQuoteRaw, tip.volume24hQuoteRaw);
  const volumeUsd = addNumericStrings(canonical.volume24hUsdX18, tip.volume24hUsdX18);
  return {
    ...canonical,
    ...bestImageFields(canonical, tip),
    priceQuoteX18: tip.priceQuoteX18 ?? canonical.priceQuoteX18,
    priceQuoteDisplay:
      tip.priceQuoteX18 == null ? canonical.priceQuoteDisplay : formatX18(tip.priceQuoteX18),
    priceUsdX18: tip.priceUsdX18 ?? canonical.priceUsdX18,
    priceUsdDisplay:
      tip.priceUsdX18 == null ? canonical.priceUsdDisplay : formatX18(tip.priceUsdX18),
    fdvUsdX18: tip.fdvUsdX18 ?? canonical.fdvUsdX18,
    fdvUsdDisplay: tip.fdvUsdX18 == null ? canonical.fdvUsdDisplay : formatX18(tip.fdvUsdX18),
    volume24hQuoteRaw: volumeQuote,
    volume24hQuoteDisplay:
      volumeQuote == null ? null : formatRawAmount(volumeQuote, canonical.decimals),
    volume24hUsdX18: volumeUsd,
    volume24hUsdDisplay: formatX18(volumeUsd),
    tradeCount24h: addNullableNumber(canonical.tradeCount24h, tip.tradeCountDelta),
    tradeCountAllTime: addNullableNumber(canonical.tradeCountAllTime, tip.tradeCountDelta),
    buyCount24h: addNullableNumber(canonical.buyCount24h, tip.buyCountDelta),
    sellCount24h: addNullableNumber(canonical.sellCount24h, tip.sellCountDelta),
    lastTradeAt:
      tip.lastTradeAt == null
        ? canonical.lastTradeAt
        : Math.max(canonical.lastTradeAt ?? 0, tip.lastTradeAt),
  };
}

/**
 * Canonical rows always win duplicate identities. Live rows at/below the main
 * checkpoint are omitted because canonical ingest has already reached them.
 */
export function mergeLiveTrades(
  canonical: TradeItem[],
  live: LiveTrade[],
  checkpointBlock: number | null,
): Array<LiveAnnotated<TradeItem>> {
  const canonicalKeys = new Set(canonical.map(key));
  const confirmed = canonical.map((trade) => ({
    ...trade,
    source: 'confirmed' as const,
  }));
  const overlay = live
    .filter((trade) => isFresh(trade))
    .filter(
      (trade) =>
        !canonicalKeys.has(key(trade)) &&
        (checkpointBlock == null || trade.blockNumber > checkpointBlock),
    )
    .map((trade) => ({ ...trade, source: 'live' as const }));
  return [...confirmed, ...overlay].sort(
    (a, b) =>
      b.blockTimestamp - a.blockTimestamp ||
      b.blockNumber - a.blockNumber ||
      b.logIndex - a.logIndex,
  );
}

export function applyLiveTipToTokenDetail(
  detail: TokenDetail | null,
  tip: LiveTokenTip | null,
): TokenDetail | null {
  if (!tip || !isFresh(tip)) return detail;
  if (detail && detail.sourceBlock != null && tip.sourceBlock <= detail.sourceBlock) {
    const images = bestImageFields(detail, tip);
    if (images.displayImageUrl === detail.displayImageUrl && images.imageUri === detail.imageUri) {
      return detail;
    }
    return { ...detail, ...images };
  }
  const base = detail ?? liveDiscoveryItem(tip, Math.floor(Date.now() / 1000));
  if (!base) return detail;
  const discovery = overlayDiscovery(base, tip);
  if (detail) return { ...detail, ...discovery };

  return {
    ...discovery,
    description: tip.description ?? '',
    twitter: tip.twitter ?? '',
    telegram: tip.telegram ?? '',
    discord: tip.discord ?? '',
    website: tip.website ?? '',
    farcaster: tip.farcaster ?? '',
    totalSupplyRaw: tip.totalSupplyRaw ?? '0',
    totalSupplyDisplay: formatRawAmount(tip.totalSupplyRaw ?? '0', tip.decimals ?? 18),
    deployerAddress: tip.deployerAddress ?? '',
    factoryAddress: tip.factoryAddress ?? '',
    feeDistributorAddress: '',
    liquidityLockerAddress: '',
    sqrtPriceX96: null,
    tick: null,
    liquidityRaw: null,
    quoteUsdX18: null,
    quoteVolumeAllTimeRaw: tip.volume24hQuoteRaw,
    tokenVolumeAllTimeRaw: null,
    buyCountAllTime: tip.buyCountDelta,
    sellCountAllTime: tip.sellCountDelta,
    initialTokenInventoryRaw: null,
    currentTokenInventoryRaw: null,
    sourceBlock: tip.sourceBlock,
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
  };
}

export function mergeLiveDiscoveryItems(
  canonical: TokenDiscoveryItem[],
  liveTips: LiveTokenTip[],
): TokenDiscoveryItem[] {
  const freshTips = liveTips.filter((tip) => isFresh(tip));
  const tipByToken = new Map(
    freshTips.map((tip) => [tip.tokenAddress.toLowerCase(), tip] as const),
  );
  const seen = new Set<string>();
  const merged = canonical.map((item) => {
    const address = item.tokenAddress.toLowerCase();
    seen.add(address);
    const tip = tipByToken.get(address);
    return tip ? overlayDiscovery(item, tip) : item;
  });
  const nowSec = Math.floor(Date.now() / 1000);
  for (const tip of freshTips) {
    if (seen.has(tip.tokenAddress.toLowerCase())) continue;
    const item = liveDiscoveryItem(tip, nowSec);
    if (item) merged.push(item);
  }
  return merged.sort(
    (a, b) => b.launchedAt - a.launchedAt || a.tokenAddress.localeCompare(b.tokenAddress),
  );
}
