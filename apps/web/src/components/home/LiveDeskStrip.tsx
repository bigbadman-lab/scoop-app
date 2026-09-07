'use client';

import { useEffect, useRef, useState } from 'react';

type SpotResponse = {
  ethUsd: number | null;
  btcUsd: number | null;
  asOf: string;
  source: 'coingecko' | 'unavailable';
};

function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatLocalTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatTimeZone(date: Date): string {
  const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

function Sep() {
  return (
    <span className="px-1 text-[var(--muted-2)]" aria-hidden>
      ·
    </span>
  );
}

function PriceCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'eth' | 'btc';
}) {
  const display = formatUsd(value);
  const prevValue = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) {
      prevValue.current = value;
      return;
    }
    if (prevValue.current == null) {
      prevValue.current = value;
      return;
    }
    if (value === prevValue.current) return;
    const direction = value > prevValue.current ? 'up' : 'down';
    prevValue.current = value;
    setFlash(direction);
    const timer = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(timer);
  }, [value]);

  const toneClass = tone === 'eth' ? 'desk-tone-eth' : 'desk-tone-btc';

  return (
    <span className={`inline-flex items-baseline gap-1 ${toneClass}`}>
      <span className="opacity-80">{label}</span>
      <span
        className={[
          'tabular transition-colors duration-500',
          flash === 'up' ? 'desk-flash-up' : '',
          flash === 'down' ? 'desk-flash-down' : '',
        ].join(' ')}
      >
        {display}
      </span>
    </span>
  );
}

/**
 * Self-contained editorial desk strip — local clock + live ETH/BTC spot.
 * Prices from `/api/market/spot` (real feed); never mocked.
 */
export function LiveDeskStrip() {
  const [now, setNow] = useState<Date | null>(null);
  const [spot, setSpot] = useState<SpotResponse | null>(null);

  useEffect(() => {
    setNow(new Date());
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/market/spot', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as SpotResponse;
        if (!cancelled) setSpot(data);
      } catch {
        if (!cancelled) {
          setSpot({
            ethUsd: null,
            btcUsd: null,
            asOf: new Date().toISOString(),
            source: 'unavailable',
          });
        }
      }
    }

    void load();
    const poll = window.setInterval(() => void load(), 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const timeLabel = now ? formatLocalTime(now) : '—:—:—';
  const zoneLabel = now ? formatTimeZone(now) : '';

  return (
    <div className="live-desk-strip mb-3 md:mb-4" aria-label="Live desk">
      <span className="inline-flex items-center gap-1.5 text-[var(--fg)]">
        <span className="desk-live-dot" aria-hidden />
        <span>Live</span>
      </span>
      <Sep />
      <time className="tabular text-[var(--fg)]" dateTime={now?.toISOString()} suppressHydrationWarning>
        {timeLabel}
        {zoneLabel ? <span className="ml-1 text-[var(--muted)]">{zoneLabel}</span> : null}
      </time>
      <Sep />
      <PriceCell label="ETH" value={spot?.ethUsd ?? null} tone="eth" />
      <Sep />
      <PriceCell label="BTC" value={spot?.btcUsd ?? null} tone="btc" />
    </div>
  );
}
