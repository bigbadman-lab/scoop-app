/** Truncate a 0x address for mono display. */
export function truncateAddress(address: string, left = 5, right = 3): string {
  const value = address.trim();
  if (value.length <= left + right + 2) return value;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

/** Relative time label for JUST IN · <time>. */
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

/** Pass through real FDV display; never invent values. */
export function displayFdv(fdvUsdDisplay: string | null | undefined): string | null {
  if (!fdvUsdDisplay) return null;
  const trimmed = fdvUsdDisplay.trim();
  return trimmed.length > 0 ? trimmed : null;
}
