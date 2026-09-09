import type { TradeItem } from '@scoop/db';
import { displayUsd, formatCompactAge, truncateAddress } from '@/lib/format';
import { tradeIdentity } from '@/lib/token/trade-series';

/** Fetch window for Recent Trades (API default/max-friendly). */
export const RECENT_TRADES_FETCH_LIMIT = 50;

/** Visible row cap — busy markets stay bounded. */
export const RECENT_TRADES_VISIBLE_CAP = 20;

export { tradeIdentity };

/** Newest-first (API order) → trim to visible cap. Does not reverse. */
export function boundRecentTrades(
  tradesNewestFirst: readonly TradeItem[],
  cap: number = RECENT_TRADES_VISIBLE_CAP,
): TradeItem[] {
  const n = Math.max(0, Math.floor(cap));
  return tradesNewestFirst.slice(0, n);
}

/**
 * Future ~2s live helper: merge incoming with existing by stable identity,
 * keep newest-first, trim to cap. Incoming wins on duplicate ids.
 */
export function mergeRecentTradesNewestFirst(
  existing: readonly TradeItem[],
  incoming: readonly TradeItem[],
  cap: number = RECENT_TRADES_VISIBLE_CAP,
): TradeItem[] {
  const map = new Map<string, TradeItem>();
  for (const t of existing) map.set(tradeIdentity(t), t);
  for (const t of incoming) map.set(tradeIdentity(t), t);
  return [...map.values()]
    .sort(
      (a, b) =>
        b.blockTimestamp - a.blockTimestamp || b.logIndex - a.logIndex,
    )
    .slice(0, Math.max(0, Math.floor(cap)));
}

/** Prefer traderAddress, then txFrom — never invent identity. */
export function resolveTradeAccount(trade: TradeItem): string | null {
  const trader = trade.traderAddress?.trim();
  if (trader) return trader;
  const from = trade.txFrom?.trim();
  if (from) return from;
  return null;
}

export function formatTradeAccountDisplay(address: string | null): string {
  if (!address) return '—';
  return truncateAddress(address, 6, 4);
}

export function formatTradeSideLabel(side: string): 'BUY' | 'SELL' | string {
  const s = side.trim().toLowerCase();
  if (s === 'buy') return 'BUY';
  if (s === 'sell') return 'SELL';
  return side.trim().toUpperCase() || '—';
}

/** USD execution when indexed; else quote execution + symbol. Never synthesize USD. */
export function formatTradeExecutionPrice(
  trade: TradeItem,
  quoteSymbol: string,
): string {
  if (trade.executionPriceUsdX18 != null && trade.executionPriceUsdX18 !== '') {
    const usd = displayUsd(trade.executionPriceUsdDisplay);
    if (usd) return usd;
  }
  const quote = trade.executionPriceQuoteDisplay?.trim();
  if (quote) return `${quote} ${quoteSymbol}`;
  return '—';
}

export function formatTradeUsdValue(trade: TradeItem): string {
  if (trade.usdValueX18 == null || trade.usdValueX18 === '') return '—';
  return displayUsd(trade.usdValueDisplay) ?? '—';
}

export function formatTradeQuoteAmount(
  trade: TradeItem,
  quoteSymbol: string,
): string {
  const amt = trade.quoteAmountDisplay?.trim();
  if (!amt) return '—';
  return `${amt} ${quoteSymbol}`;
}

export function formatTradeTokenAmount(trade: TradeItem): string {
  const amt = trade.tokenAmountDisplay?.trim();
  return amt || '—';
}

/** Compact relative age from unix seconds (brief: 12s / 2m / 18m / 3h). */
export function formatTradeAge(
  blockTimestampSec: number,
  nowSec: number = Math.floor(Date.now() / 1000),
): string {
  if (!Number.isFinite(blockTimestampSec) || blockTimestampSec <= 0) return '—';
  return formatCompactAge(Math.max(0, nowSec - blockTimestampSec));
}

export function formatTradeAbsoluteTime(blockTimestampSec: number): string {
  if (!Number.isFinite(blockTimestampSec) || blockTimestampSec <= 0) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(blockTimestampSec * 1000));
}
