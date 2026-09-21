/**
 * PumpPortal trade payload → NormalizedPumpTradeEvent.
 *
 * Documented live trade shape (PumpPortal Data API / community samples):
 * {
 *   mint, signature, txType ("buy"|"sell"),
 *   tokenAmount, solAmount, traderPublicKey,
 *   bondingCurveKey?, marketCapSol?,
 *   vSolInBondingCurve?, vTokensInBondingCurve?,
 *   newTokenBalance?, pool?, poolAddress?
 * }
 *
 * No official eventIndex / slot / blockTime — see event identity notes.
 */

import { createHash } from 'node:crypto';
import { PUMP_TOKEN_DECIMALS } from '@scoop/shared';
import type { NormalizedPumpTradeEvent } from './types.js';

const SOLANA_BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOLANA_SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/;
const SOL_DECIMALS = 9;

/** Fields observed on PumpPortal subscribeTokenTrade messages. */
export type PumpPortalTradePayload = {
  mint?: unknown;
  signature?: unknown;
  txType?: unknown;
  tokenAmount?: unknown;
  solAmount?: unknown;
  traderPublicKey?: unknown;
  bondingCurveKey?: unknown;
  marketCapSol?: unknown;
  vSolInBondingCurve?: unknown;
  vTokensInBondingCurve?: unknown;
  newTokenBalance?: unknown;
  /** Some PumpSwap samples expose pool / poolAddress instead of bondingCurveKey. */
  pool?: unknown;
  poolAddress?: unknown;
  /** Rare / optional — prefer if present. */
  slot?: unknown;
  timestamp?: unknown;
  eventIndex?: unknown;
  instructionIndex?: unknown;
};

export type NormalizePumpPortalResult =
  | { ok: true; event: NormalizedPumpTradeEvent }
  | { ok: false; error: string };

function isBase58Address(raw: string): boolean {
  return SOLANA_BASE58_RE.test(raw) && !raw.startsWith('0x');
}

function isBase58Sig(raw: string): boolean {
  return SOLANA_SIG_RE.test(raw) && !raw.startsWith('0x');
}

/** Accept number or numeric string; reject NaN/Infinity/negative. */
export function coercePositiveDecimalString(value: unknown, label: string): string {
  if (typeof value === 'string') {
    const t = value.trim();
    if (!/^\d+(\.\d+)?$/.test(t)) {
      throw new Error(`invalid ${label}`);
    }
    return t.replace(/^0+(?=\d)/, '') || '0';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`invalid ${label}`);
    }
    // Prefer exact integer path; otherwise fixed-trim without scientific notation.
    if (Number.isInteger(value)) return String(value);
    const s = value.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 18,
    });
    if (!/^\d+(\.\d+)?$/.test(s)) {
      throw new Error(`invalid ${label}`);
    }
    return s;
  }
  throw new Error(`invalid ${label}`);
}

/**
 * Convert a non-negative decimal string to integer raw units (no float).
 * "1.5" @ 9 decimals → "1500000000"
 */
export function decimalStringToRaw(decimal: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(decimal)) {
    throw new Error(`invalid decimal: ${decimal}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const [wholePart, fracPart = ''] = decimal.split('.');
  if (fracPart.length > decimals) {
    // Truncate excess fractional digits (fail-closed alternative would reject).
    // Truncation is safer than rounding for notional floors.
  }
  const fracPadded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const combined = `${wholePart}${fracPadded}`.replace(/^0+(?=\d)/, '') || '0';
  return combined;
}

/** price = sol / tokens as decimal string (fail if tokens == 0). */
export function priceSolFromAmounts(solAmount: string, tokenAmount: string): string {
  const solRaw = decimalStringToRaw(solAmount, 18);
  const tokRaw = decimalStringToRaw(tokenAmount, 18);
  const sol = BigInt(solRaw);
  const tok = BigInt(tokRaw);
  if (tok === BigInt(0)) {
    throw new Error('tokenAmount is zero');
  }
  // price_x18 = sol_x18 * 1e18 / tok_x18
  const priceX18 = (sol * 10n ** 18n) / tok;
  const whole = priceX18 / 10n ** 18n;
  const frac = priceX18 % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

/**
 * Deterministic event identity when PumpPortal does not supply eventIndex.
 * Hash(signature|mint|txType|solAmount|tokenAmount|trader) → uint31.
 * Documented: not assuming one trade per signature without source guarantee.
 */
export function deterministicEventIndex(parts: {
  signature: string;
  mint: string;
  txType: string;
  solAmount: string;
  tokenAmount: string;
  trader: string;
}): number {
  const h = createHash('sha256')
    .update(
      [
        parts.signature,
        parts.mint,
        parts.txType,
        parts.solAmount,
        parts.tokenAmount,
        parts.trader,
      ].join('|'),
      'utf8',
    )
    .digest();
  return h.readUInt32BE(0) & 0x7fffffff;
}

function optionalBase58(value: unknown): string | null {
  if (value == null || value === '') return null;
  const t = String(value).trim();
  if (!isBase58Address(t)) return null;
  return t;
}

/**
 * Map a single PumpPortal trade object. Returns rejection reason on failure.
 */
export function normalizePumpPortalTrade(
  payload: unknown,
  opts: { receivedAt?: Date; tokenDecimals?: number } = {},
): NormalizePumpPortalResult {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'not an object' };
  }
  const p = payload as PumpPortalTradePayload;

  // Ignore non-trade control / create messages.
  const txTypeRaw = p.txType == null ? '' : String(p.txType).trim().toLowerCase();
  if (txTypeRaw === 'create' || txTypeRaw === 'migration') {
    return { ok: false, error: `ignored txType:${txTypeRaw}` };
  }
  if (txTypeRaw !== 'buy' && txTypeRaw !== 'sell') {
    // Messages without txType (acks / errors) are not trades.
    if (!txTypeRaw) return { ok: false, error: 'missing txType' };
    return { ok: false, error: `invalid txType:${txTypeRaw}` };
  }

  try {
    const mint = String(p.mint ?? '').trim();
    if (!isBase58Address(mint)) {
      return { ok: false, error: 'invalid mint' };
    }
    const signature = String(p.signature ?? '').trim();
    if (!isBase58Sig(signature)) {
      return { ok: false, error: 'invalid signature' };
    }

    const solAmount = coercePositiveDecimalString(p.solAmount, 'solAmount');
    const tokenAmount = coercePositiveDecimalString(p.tokenAmount, 'tokenAmount');
    if (tokenAmount === '0' || /^0+(\.0+)?$/.test(tokenAmount)) {
      return { ok: false, error: 'tokenAmount is zero' };
    }

    const trader =
      p.traderPublicKey == null || p.traderPublicKey === ''
        ? ''
        : String(p.traderPublicKey).trim();
    if (trader && !isBase58Address(trader)) {
      return { ok: false, error: 'invalid traderPublicKey' };
    }

    const decimals = opts.tokenDecimals ?? PUMP_TOKEN_DECIMALS;
    const tokenAmountRaw = decimalStringToRaw(tokenAmount, decimals);
    const solAmountLamports = decimalStringToRaw(solAmount, SOL_DECIMALS);
    const priceSol = priceSolFromAmounts(solAmount, tokenAmount);

    let eventIndex: number;
    if (p.eventIndex != null || p.instructionIndex != null) {
      const raw = Number(p.eventIndex ?? p.instructionIndex);
      if (!Number.isInteger(raw) || raw < 0) {
        return { ok: false, error: 'invalid eventIndex' };
      }
      eventIndex = raw;
    } else {
      eventIndex = deterministicEventIndex({
        signature,
        mint,
        txType: txTypeRaw,
        solAmount,
        tokenAmount,
        trader,
      });
    }

    let slot = 0;
    if (p.slot != null && p.slot !== '') {
      const n = Number(p.slot);
      if (!Number.isInteger(n) || n < 0) {
        return { ok: false, error: 'invalid slot' };
      }
      slot = n;
    }

    let blockTime = opts.receivedAt ?? new Date();
    if (p.timestamp != null && p.timestamp !== '') {
      const ts = Number(p.timestamp);
      if (!Number.isFinite(ts)) {
        return { ok: false, error: 'invalid timestamp' };
      }
      // Accept seconds or ms.
      blockTime = new Date(ts > 1e12 ? ts : ts * 1000);
      if (Number.isNaN(blockTime.getTime())) {
        return { ok: false, error: 'invalid timestamp' };
      }
    }

    const curveAddress =
      optionalBase58(p.bondingCurveKey) ??
      optionalBase58(p.pool) ??
      optionalBase58(p.poolAddress);

    return {
      ok: true,
      event: {
        mint,
        signature,
        eventIndex,
        slot,
        blockTime,
        side: txTypeRaw,
        wallet: trader || null,
        tokenAmountRaw,
        tokenAmount,
        solAmountLamports,
        solAmount,
        priceSol,
        source: 'pumpportal',
        curveAddress,
        poolHint: curveAddress,
        providerCursor: `${signature}:${eventIndex}`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

/** Classify provider control / error text into health status. */
export function classifyPumpPortalProviderError(text: string): {
  status: 'blocked_auth' | 'blocked_funding' | 'error';
  error: string;
} {
  const t = text.toLowerCase();
  if (
    t.includes('invalid api') ||
    t.includes('unauthorized') ||
    t.includes('api key') ||
    t.includes('authentication') ||
    t.includes('forbidden')
  ) {
    return { status: 'blocked_auth', error: 'PumpPortal authentication failed' };
  }
  if (
    t.includes('fund') ||
    t.includes('insufficient') ||
    t.includes('0.02') ||
    t.includes('balance') ||
    t.includes('wallet')
  ) {
    return { status: 'blocked_funding', error: 'PumpPortal wallet funding requirement not met' };
  }
  if (t.includes('rate') || t.includes('limit') || t.includes('throttle')) {
    return { status: 'error', error: 'PumpPortal rate limit' };
  }
  if (t.includes('reject') || t.includes('subscription')) {
    return { status: 'error', error: 'PumpPortal subscription rejected' };
  }
  return { status: 'error', error: text.slice(0, 200) };
}
