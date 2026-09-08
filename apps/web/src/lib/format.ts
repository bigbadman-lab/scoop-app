/** Truncate a 0x address for mono display. */
export function truncateAddress(address: string, left = 5, right = 3): string {
  const value = address.trim();
  if (value.length <= left + right + 2) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

/** Relative time label for general UI (e.g. activity). */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const deltaSec = Math.max(0, Math.floor((now - then) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Editorial news age labels: JUST IN / 1M / 12M / 1H / date.
 * Pass `now` in tests to avoid flaky clock coupling.
 */
export function formatNewsAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const deltaSec = Math.max(0, Math.floor((now - then) / 1000));
  if (deltaSec < 90) return 'JUST IN';
  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) return `${mins}M`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}H`;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(then);
}

/** Compact age for market activity (e.g. 2m, 1h). */
export function formatCompactAge(ageSeconds: number): string {
  const s = Math.max(0, Math.floor(ageSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Bonding progress percent from bps. */
export function formatProgressPercent(bps: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(bps / 100)));
  return `${pct}%`;
}

/** Pass through real display string; never invent values. */
export function displayFdv(fdvUsdDisplay: string | null | undefined): string | null {
  if (!fdvUsdDisplay) return null;
  const trimmed = fdvUsdDisplay.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** USD amount with `$` prefix; null when missing — never `$0` from null. */
export function displayUsd(amountDisplay: string | null | undefined): string | null {
  const raw = displayFdv(amountDisplay);
  if (!raw) return null;
  return raw.startsWith('$') ? raw : `$${raw}`;
}

/**
 * Prefer USD spot when present; otherwise quote-denominated price with symbol.
 * Never fabricates zeros from null.
 */
export function displayTokenPrice(args: {
  priceUsdDisplay: string | null | undefined;
  priceQuoteDisplay: string | null | undefined;
  quoteSymbol: string;
}): string | null {
  const usd = displayUsd(args.priceUsdDisplay);
  if (usd) return usd;
  const quote = displayFdv(args.priceQuoteDisplay);
  if (!quote) return null;
  return `${quote} ${args.quoteSymbol}`;
}

/** 24h change from bps. Null → null (UI shows —). True 0 bps → `0.0%`. */
export function displayPriceChangeBps(bps: number | null | undefined): string | null {
  if (bps == null || !Number.isFinite(bps)) return null;
  const tenths = Math.trunc(bps / 10);
  const sign = tenths > 0 ? '+' : tenths < 0 ? '-' : '';
  const absTenths = Math.abs(tenths);
  return `${sign}${Math.floor(absTenths / 10)}.${absTenths % 10}%`;
}

/** 24h quote volume label; null when missing (do not fake 0). */
export function displayVolume24h(
  volumeDisplay: string | null | undefined,
  quoteSymbol: string,
): string | null {
  const v = displayFdv(volumeDisplay);
  if (!v) return null;
  return `24h vol ${v} ${quoteSymbol}`;
}

/** Prefer retail holders; fall back to all. Null when unknown. */
export function displayHolderCount(
  retail: number | null | undefined,
  all: number | null | undefined,
): string | null {
  const n = retail ?? all;
  if (n == null || !Number.isFinite(n)) return null;
  const count = Math.max(0, Math.floor(n));
  return `${count} holder${count === 1 ? '' : 's'}`;
}
