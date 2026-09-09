import type { TokenDetail, TradeItem } from '@scoop/db';
import { mergeTradesByIdentity, tradeIdentity } from '@/lib/token/trade-series';
import {
  RECENT_TRADES_VISIBLE_CAP,
  mergeRecentTradesNewestFirst,
} from '@/lib/token/recent-trades';

/** Coordinated token-page live poll cadence (MVP). */
export const TOKEN_MARKET_LIVE_POLL_MS = 2000;

/**
 * Browser-side rolling window for PRICE (trades, not bars).
 * Seed remains API max 100; live appends may grow up to this cap.
 */
export const PRICE_CHART_ROLLING_TRADE_CAP = 200;

/** Live fields that must stay synchronized across header / metrics / MARKET. */
export function liveTokenFingerprint(token: TokenDetail): string {
  return [
    token.priceUsdX18 ?? '',
    token.priceQuoteX18 ?? '',
    token.priceUsdDisplay ?? '',
    token.priceQuoteDisplay ?? '',
    token.fdvUsdX18 ?? '',
    token.fdvUsdDisplay ?? '',
    token.volume24hUsdX18 ?? '',
    token.volume24hUsdDisplay ?? '',
    token.volume24hQuoteRaw ?? '',
    token.volume24hQuoteDisplay ?? '',
    token.tradeCount24h ?? '',
    token.holderCountRetail ?? '',
    token.holderCountAll ?? '',
    token.launchProgressBps,
    token.launchComplete ? '1' : '0',
    token.priceChange24hBps ?? '',
    token.lastTradeAt ?? '',
    token.creatorFeesLifetimeEthRaw ?? '',
    token.buybackFeesLifetimeEthRaw ?? '',
  ].join('|');
}

export function tradesFingerprint(trades: readonly TradeItem[]): string {
  return trades.map((t) => tradeIdentity(t)).join(',');
}

/** Trim chronological ASC trades to the newest `cap` (drop oldest). */
export function trimRollingTradesChronological(
  tradesChronoAsc: readonly TradeItem[],
  cap: number = PRICE_CHART_ROLLING_TRADE_CAP,
): TradeItem[] {
  const n = Math.max(0, Math.floor(cap));
  if (tradesChronoAsc.length <= n) return [...tradesChronoAsc];
  return tradesChronoAsc.slice(tradesChronoAsc.length - n);
}

function isSameOrNewerTrade(a: TradeItem, b: TradeItem): boolean {
  return (
    a.blockTimestamp > b.blockTimestamp ||
    (a.blockTimestamp === b.blockTimestamp && a.logIndex >= b.logIndex)
  );
}

/**
 * True when an existing head should still appear in the incoming API window
 * but is missing — treat as reorg / order mismatch and reseed from incoming.
 */
export function shouldReseedFromTradeHead(
  existingChronoAsc: readonly TradeItem[],
  incomingNewestFirst: readonly TradeItem[],
): boolean {
  if (existingChronoAsc.length === 0 || incomingNewestFirst.length === 0) {
    return false;
  }
  const prevNewest = existingChronoAsc[existingChronoAsc.length - 1]!;
  const incomingIds = new Set(incomingNewestFirst.map((t) => tradeIdentity(t)));
  if (incomingIds.has(tradeIdentity(prevNewest))) return false;

  const oldestIncoming = incomingNewestFirst[incomingNewestFirst.length - 1]!;
  // Previous head is newer than the oldest row in the poll window but absent → mismatch.
  return isSameOrNewerTrade(prevNewest, oldestIncoming);
}

export type LiveTradePollResult = {
  tradesChronoAsc: TradeItem[];
  /** How the chart should apply the result. */
  apply: 'unchanged' | 'append' | 'reseed';
  /** New trades at the chronological tail (append path only). */
  appended: TradeItem[];
};

/**
 * Merge one trades-head poll into the rolling client window.
 * Incoming may be newest-first (API) or mixed; output is chronological ASC.
 */
export function applyLiveTradePoll(args: {
  existingChronoAsc: readonly TradeItem[];
  incomingNewestFirst: readonly TradeItem[];
  rollingCap?: number;
}): LiveTradePollResult {
  const rollingCap = args.rollingCap ?? PRICE_CHART_ROLLING_TRADE_CAP;
  const existing = args.existingChronoAsc;
  const incoming = args.incomingNewestFirst;

  if (incoming.length === 0 && existing.length === 0) {
    return { tradesChronoAsc: [], apply: 'unchanged', appended: [] };
  }

  if (shouldReseedFromTradeHead(existing, incoming)) {
    const reseeds = trimRollingTradesChronological(
      mergeTradesByIdentity([], incoming),
      rollingCap,
    );
    return { tradesChronoAsc: reseeds, apply: 'reseed', appended: [] };
  }

  const merged = trimRollingTradesChronological(
    mergeTradesByIdentity(existing, incoming),
    rollingCap,
  );

  if (tradesFingerprint(merged) === tradesFingerprint(existing)) {
    return { tradesChronoAsc: existing as TradeItem[], apply: 'unchanged', appended: [] };
  }

  const existingIds = existing.map((t) => tradeIdentity(t));
  const mergedIds = merged.map((t) => tradeIdentity(t));

  // Append-only when existing is an exact prefix of merged.
  if (
    mergedIds.length >= existingIds.length &&
    existingIds.every((id, i) => mergedIds[i] === id)
  ) {
    return {
      tradesChronoAsc: merged,
      apply: 'append',
      appended: merged.slice(existing.length),
    };
  }

  // Rolling trim or middle/order change — reseed chart window.
  return { tradesChronoAsc: merged, apply: 'reseed', appended: [] };
}

/** Newest-first visible Recent Trades from the shared chronological window. */
export function recentTradesFromLiveWindow(
  tradesChronoAsc: readonly TradeItem[],
  cap: number = RECENT_TRADES_VISIBLE_CAP,
): TradeItem[] {
  return mergeRecentTradesNewestFirst([], tradesChronoAsc, cap);
}

/** Merge live token only when canonical live fields change. */
export function mergeLiveToken(
  previous: TokenDetail,
  incoming: TokenDetail,
): { token: TokenDetail; changed: boolean } {
  if (liveTokenFingerprint(previous) === liveTokenFingerprint(incoming)) {
    return { token: previous, changed: false };
  }
  // Prefer incoming for live fields; keep previous object identity for static
  // identity/about fields that are identical to avoid pointless child churn.
  return { token: { ...previous, ...incoming }, changed: true };
}
