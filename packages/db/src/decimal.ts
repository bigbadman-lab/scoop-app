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

/** Format an x18 fixed-point integer string for display. */
export function formatX18(value: string | bigint | null | undefined, maxFracDigits = 8): string | null {
  if (value == null) return null;
  return formatRawAmount(value, 18, maxFracDigits);
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
