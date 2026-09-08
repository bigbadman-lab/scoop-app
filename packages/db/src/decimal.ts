/**
 * String-decimal helpers — never coerce on-chain amounts through Number/float.
 * All inputs are decimal integer strings (optionally signed).
 */

function assertIntString(value: string, label = 'value'): bigint {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Invalid integer string for ${label}: ${value}`);
  }
  return BigInt(trimmed);
}

function looksLikeZeroDisplay(formatted: string): boolean {
  return /^(-?)0(\.0*)?$/.test(formatted);
}

/** Format a raw integer amount with `decimals` fractional digits (no float). */
export function formatRawAmount(
  raw: string | bigint,
  decimals: number,
  maxFracDigits = decimals,
): string {
  const n = typeof raw === 'bigint' ? raw : assertIntString(raw, 'raw');
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  if (!Number.isInteger(maxFracDigits) || maxFracDigits < 0) {
    throw new Error(`Invalid maxFracDigits: ${maxFracDigits}`);
  }
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, '0');
  if (maxFracDigits < decimals) {
    frac = frac.slice(0, maxFracDigits);
  }
  frac = frac.replace(/0+$/, '');
  const body = frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

/**
 * Frac digit count that keeps `significantDigits` after the first non-zero digit
 * for values with whole part 0 (tiny fractions).
 */
export function fracDigitsForSignificant(
  absRaw: bigint,
  decimals: number,
  significantDigits: number,
): number {
  if (absRaw <= 0n || significantDigits < 1) return 0;
  const scale = 10n ** BigInt(decimals);
  const whole = absRaw / scale;
  if (whole > 0n) {
    // Whole part present — caller should use normal compact formatting.
    return Math.min(decimals, significantDigits);
  }
  const frac = absRaw % scale;
  const fracStr = frac.toString().padStart(decimals, '0');
  let firstNonZero = 0;
  while (firstNonZero < fracStr.length && fracStr[firstNonZero] === '0') {
    firstNonZero += 1;
  }
  if (firstNonZero >= fracStr.length) return 0;
  return Math.min(decimals, firstNonZero + significantDigits);
}

/**
 * Format an x18 fixed-point integer string for display.
 * Non-zero values never collapse to "0" — expands fractional digits to keep
 * ~`significantDigits` meaningful digits when the compact truncation would wipe them.
 */
export function formatX18(
  value: string | bigint | null | undefined,
  maxFracDigits = 8,
  significantDigits = 4,
): string | null {
  if (value == null) return null;
  const n = typeof value === 'bigint' ? value : assertIntString(value, 'x18');
  if (n === 0n) return '0';

  const compact = formatRawAmount(n, 18, maxFracDigits);
  if (!looksLikeZeroDisplay(compact)) return compact;

  const abs = n < 0n ? -n : n;
  const digits = fracDigitsForSignificant(abs, 18, significantDigits);
  return formatRawAmount(n, 18, Math.max(digits, 1));
}

/**
 * Percent of supply as integer bps: floor(balance * 10000 / totalSupply).
 * Returns 0 when supply is 0.
 */
export function percentOfSupplyBps(balanceRaw: string | bigint, totalSupplyRaw: string | bigint): number {
  const balance = typeof balanceRaw === 'bigint' ? balanceRaw : assertIntString(balanceRaw, 'balance');
  const supply =
    typeof totalSupplyRaw === 'bigint' ? totalSupplyRaw : assertIntString(totalSupplyRaw, 'totalSupply');
  if (supply <= 0n) return 0;
  const bps = (balance * 10000n) / supply;
  if (bps > BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number(bps);
}

/**
 * Percent of supply as x18 fixed-point string: floor(balance * 1e18 / totalSupply).
 * Returns "0" when supply is 0.
 */
export function percentOfSupplyX18(
  balanceRaw: string | bigint,
  totalSupplyRaw: string | bigint,
): string {
  const balance = typeof balanceRaw === 'bigint' ? balanceRaw : assertIntString(balanceRaw, 'balance');
  const supply =
    typeof totalSupplyRaw === 'bigint' ? totalSupplyRaw : assertIntString(totalSupplyRaw, 'totalSupply');
  if (supply <= 0n) return '0';
  return ((balance * 10n ** 18n) / supply).toString(10);
}

export function clampLimit(limit: number | undefined, max = 100, fallback = 50): number {
  if (limit == null || !Number.isFinite(limit)) return fallback;
  const n = Math.floor(limit);
  if (n < 1) return 1;
  if (n > max) return max;
  return n;
}

export function clampOffset(offset: number | undefined): number {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}
