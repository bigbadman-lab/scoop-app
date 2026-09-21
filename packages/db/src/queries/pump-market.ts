/**
 * Pump trade / candle / market-state product reads.
 * Maps into shared TradeItem / CandleItem shapes for token-page reuse.
 */

import type { Queryable } from '../types.js';
import type { CandleItem, CandleInterval, TokenDetail, TradeItem } from '../dto.js';
import { formatRawAmount, formatX18 } from '../decimal.js';
import { clampLimit, clampOffset } from '../decimal.js';
import {
  getPumpMarketState,
  type PumpMarketStateRow,
} from '../repos/pump-market-state.js';
import { PUMP_MARKET_CHAIN_ID } from '../repos/pump-trades.js';
import type { PumpCandleInterval } from '../repos/pump-candles.js';

const SOL_DECIMALS = 9;
const X18 = 10n ** 18n;

export type GetPumpTradesOptions = {
  limit?: number;
  offset?: number;
  side?: 'buy' | 'sell';
};

export type GetPumpCandlesOptions = {
  from?: number;
  to?: number;
  limit?: number;
};

/** Convert a decimal SOL string (e.g. "0.00123") to x18 integer string. */
export function solDecimalToX18(solDecimal: string): string {
  const t = solDecimal.trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    throw new Error(`Invalid SOL decimal: ${solDecimal}`);
  }
  const neg = t.startsWith('-');
  const body = neg ? t.slice(1) : t;
  const [wholePart, fracPart = ''] = body.split('.');
  const whole = BigInt(wholePart || '0');
  const fracPadded = (fracPart + '0'.repeat(18)).slice(0, 18);
  const frac = BigInt(fracPadded || '0');
  const raw = whole * X18 + frac;
  return (neg ? -raw : raw).toString();
}

/** Lamports (9 decimals) as quote raw for TradeItem compatibility. */
function solToLamports(solAmount: string): string {
  const x18 = BigInt(solDecimalToX18(solAmount));
  // lamports = sol * 1e9 = x18 / 1e9
  return (x18 / 10n ** 9n).toString();
}

function mapTradeRow(
  row: Record<string, unknown>,
  tokenDecimals: number,
): TradeItem {
  const priceX18 = solDecimalToX18(String(row.price_sol));
  const quoteRaw = solToLamports(String(row.sol_amount));
  const tokenRaw = String(row.token_amount_raw);
  const ts =
    row.block_time instanceof Date
      ? Math.floor(row.block_time.getTime() / 1000)
      : Math.floor(new Date(String(row.block_time)).getTime() / 1000);

  return {
    chainId: PUMP_MARKET_CHAIN_ID,
    txHash: String(row.signature),
    logIndex: Number(row.event_index),
    blockNumber: Number(row.slot),
    blockTimestamp: ts,
    tokenAddress: String(row.mint),
    poolId: row.curve_address ? String(row.curve_address) : String(row.mint),
    side: String(row.side),
    swapSender: row.wallet ? String(row.wallet) : '',
    txFrom: row.wallet ? String(row.wallet) : null,
    traderAddress: row.wallet ? String(row.wallet) : null,
    traderAttributionType: row.wallet ? 'wallet' : 'unknown',
    quoteAmountRaw: quoteRaw,
    quoteAmountDisplay: formatRawAmount(quoteRaw, SOL_DECIMALS),
    tokenAmountRaw: tokenRaw,
    tokenAmountDisplay: formatRawAmount(tokenRaw, tokenDecimals),
    executionPriceQuoteX18: priceX18,
    executionPriceQuoteDisplay: formatX18(priceX18) ?? String(row.price_sol),
    quoteUsdX18: null,
    executionPriceUsdX18: null,
    executionPriceUsdDisplay: null,
    usdValueX18: null,
    usdValueDisplay: null,
    isInitialBuy: false,
    confirmationStatus: 'confirmed',
  };
}

export async function getPumpTrades(
  db: Queryable,
  mint: string,
  opts: GetPumpTradesOptions = {},
  tokenDecimals = 6,
): Promise<TradeItem[]> {
  const limit = clampLimit(opts.limit ?? 50, 100);
  const offset = clampOffset(opts.offset ?? 0);
  const params: unknown[] = [PUMP_MARKET_CHAIN_ID, mint.trim()];
  let sideSql = '';
  if (opts.side) {
    params.push(opts.side);
    sideSql = ` AND side = $${params.length}`;
  }
  params.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM pump_trades
     WHERE chain_id = $1 AND mint = $2${sideSql}
     ORDER BY block_time DESC, event_index DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return (result.rows as Record<string, unknown>[]).map((r) =>
    mapTradeRow(r, tokenDecimals),
  );
}

function mapCandleRow(row: Record<string, unknown>): CandleItem {
  const openX18 = solDecimalToX18(String(row.open_price_sol));
  const highX18 = solDecimalToX18(String(row.high_price_sol));
  const lowX18 = solDecimalToX18(String(row.low_price_sol));
  const closeX18 = solDecimalToX18(String(row.close_price_sol));
  const quoteVol = solToLamports(String(row.volume_sol));
  const bucket =
    row.bucket_start instanceof Date
      ? Math.floor(row.bucket_start.getTime() / 1000)
      : Math.floor(new Date(String(row.bucket_start)).getTime() / 1000);

  return {
    chainId: PUMP_MARKET_CHAIN_ID,
    tokenAddress: String(row.mint),
    poolId: String(row.mint),
    interval: String(row.interval) as CandleInterval,
    bucketStart: bucket,
    openQuoteX18: openX18,
    highQuoteX18: highX18,
    lowQuoteX18: lowX18,
    closeQuoteX18: closeX18,
    openQuoteDisplay: formatX18(openX18) ?? String(row.open_price_sol),
    highQuoteDisplay: formatX18(highX18) ?? String(row.high_price_sol),
    lowQuoteDisplay: formatX18(lowX18) ?? String(row.low_price_sol),
    closeQuoteDisplay: formatX18(closeX18) ?? String(row.close_price_sol),
    quoteVolumeRaw: quoteVol,
    tokenVolumeRaw: String(row.volume_tokens),
    tradeCount: Number(row.trade_count ?? 0),
    buyCount: 0,
    sellCount: 0,
    openUsdX18: null,
    highUsdX18: null,
    lowUsdX18: null,
    closeUsdX18: null,
    usdVolumeX18: null,
  };
}

export async function getPumpCandles(
  db: Queryable,
  mint: string,
  interval: PumpCandleInterval | string,
  opts: GetPumpCandlesOptions = {},
): Promise<CandleItem[]> {
  if (interval !== '1m' && interval !== '5m' && interval !== '1h') {
    throw new Error(`Invalid Pump candle interval: ${interval}`);
  }
  const limit = clampLimit(opts.limit ?? 100, 500);
  const params: unknown[] = [PUMP_MARKET_CHAIN_ID, mint.trim(), interval];
  let rangeSql = '';
  if (opts.from != null) {
    params.push(new Date(opts.from * 1000).toISOString());
    rangeSql += ` AND bucket_start >= $${params.length}::timestamptz`;
  }
  if (opts.to != null) {
    params.push(new Date(opts.to * 1000).toISOString());
    rangeSql += ` AND bucket_start <= $${params.length}::timestamptz`;
  }
  params.push(limit);
  const result = await db.query(
    `SELECT * FROM pump_candles
     WHERE chain_id = $1 AND mint = $2 AND interval = $3${rangeSql}
     ORDER BY bucket_start ASC
     LIMIT $${params.length}`,
    params,
  );
  return (result.rows as Record<string, unknown>[]).map(mapCandleRow);
}

/**
 * Overlay Pump market state onto TokenDetail quote/volume fields.
 * Leaves USD null. Never invents zero price when state is empty.
 */
export function applyPumpMarketStateToTokenDetail(
  token: TokenDetail,
  state: PumpMarketStateRow | null,
): TokenDetail {
  if (!state || state.priceSol == null) {
    return token;
  }
  const priceX18 = solDecimalToX18(state.priceSol);
  const volLamports = solToLamports(state.volume24hSol);
  return {
    ...token,
    priceQuoteX18: priceX18,
    priceQuoteDisplay: formatX18(priceX18) ?? state.priceSol,
    priceUsdX18: null,
    priceUsdDisplay: null,
    fdvUsdX18: null,
    fdvUsdDisplay: null,
    volume24hQuoteRaw: volLamports,
    volume24hQuoteDisplay: formatRawAmount(volLamports, SOL_DECIMALS),
    volume24hUsdX18: null,
    volume24hUsdDisplay: null,
    tradeCount24h: state.tradeCount24h,
    buyCount24h: state.buyCount24h,
    sellCount24h: state.sellCount24h,
    lastTradeAt: state.lastTradeAt
      ? Math.floor(state.lastTradeAt.getTime() / 1000)
      : token.lastTradeAt,
  };
}

export async function getTokenWithPumpMarketState(
  db: Queryable,
  token: TokenDetail,
): Promise<TokenDetail> {
  if (token.chainId !== PUMP_MARKET_CHAIN_ID || token.marketSource !== 'pump') {
    return token;
  }
  const state = await getPumpMarketState(db, token.tokenAddress);
  return applyPumpMarketStateToTokenDetail(token, state);
}

/** Compute FDV SOL = price_sol * (totalSupplyRaw / 10^decimals). Null if unsafe. */
export function computePumpFdvSol(args: {
  priceSol: string;
  totalSupplyRaw: string;
  decimals: number;
}): string | null {
  try {
    const priceX18 = BigInt(solDecimalToX18(args.priceSol));
    const supply = BigInt(args.totalSupplyRaw.trim());
    if (supply <= 0n || args.decimals < 0) return null;
    const scale = 10n ** BigInt(args.decimals);
    // fdv_x18 = price_x18 * supply / scale
    const fdvX18 = (priceX18 * supply) / scale;
    // convert x18 → decimal string without float
    const whole = fdvX18 / X18;
    const frac = fdvX18 % X18;
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
    return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return null;
  }
}

export { getPumpMarketState };
export type { PumpMarketStateRow };
