'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeskInstrument, SpotPayload } from '@/lib/market/spot';

function formatPrice(id: DeskInstrument['id'], value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (id === 'eth' || id === 'btc') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatChangePct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.abs(value).toFixed(2)}%`;
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

function changeTone(changePct: number | null): 'up' | 'down' | 'flat' | 'unknown' {
  if (changePct == null || !Number.isFinite(changePct)) return 'unknown';
  if (Math.abs(changePct) < 0.005) return 'flat';
  return changePct > 0 ? 'up' : 'down';
}

function MarketPill({ instrument }: { instrument: DeskInstrument }) {
  const tone = changeTone(instrument.changePct);
  const prevPrice = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const value = instrument.price;
    if (value == null || !Number.isFinite(value)) {
      prevPrice.current = value;
      return;
    }
    if (prevPrice.current == null) {
      prevPrice.current = value;
      return;
    }
    if (value === prevPrice.current) return;
    const direction = value > prevPrice.current ? 'up' : 'down';
    prevPrice.current = value;
    setFlash(direction);
    const timer = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(timer);
  }, [instrument.price]);

  const arrow = tone === 'down' ? '▼' : '▲';

  return (
    <span className="desk-pill" data-testid={`desk-pill-${instrument.id}`}>
      <span className="desk-pill-label">{instrument.label}</span>
      <span
        className={[
          'desk-pill-price tabular',
          flash === 'up' ? 'desk-flash-up' : '',
          flash === 'down' ? 'desk-flash-down' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {formatPrice(instrument.id, instrument.price)}
      </span>
      <span className={`desk-pill-change desk-change-${tone}`} aria-label={`${tone} ${formatChangePct(instrument.changePct)}`}>
        <span aria-hidden>{arrow}</span>
        <span className="tabular">{formatChangePct(instrument.changePct)}</span>
      </span>
    </span>
  );
}

/**
 * Bloomberg-style desk strip — local clock + live ETH/BTC/S&P/FTSE.
 * Prices from `/api/market/spot` (real feed); never mocked.
 */
export function LiveDeskStrip() {
  const [now, setNow] = useState<Date | null>(null);
  const [spot, setSpot] = useState<SpotPayload | null>(null);

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
        const data = (await res.json()) as SpotPayload;
        if (!cancelled) setSpot(data);
      } catch {
        if (!cancelled) {
          setSpot({
            instruments: [
              { id: 'eth', label: 'ETH', price: null, changePct: null },
              { id: 'btc', label: 'BTC', price: null, changePct: null },
              { id: 'spx', label: 'S&P 500', price: null, changePct: null },
              { id: 'ftse', label: 'FTSE 100', price: null, changePct: null },
            ],
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
  const instruments = spot?.instruments ?? [
    { id: 'eth' as const, label: 'ETH', price: null, changePct: null },
    { id: 'btc' as const, label: 'BTC', price: null, changePct: null },
    { id: 'spx' as const, label: 'S&P 500', price: null, changePct: null },
    { id: 'ftse' as const, label: 'FTSE 100', price: null, changePct: null },
  ];

  return (
    <div className="live-desk-strip mb-3 md:mb-4" aria-label="Live desk">
      <span className="desk-pill desk-pill-live">
        <span className="desk-live-dot" aria-hidden />
        <span className="desk-pill-label">Live</span>
        <time className="desk-pill-price tabular" dateTime={now?.toISOString()} suppressHydrationWarning>
          {timeLabel}
          {zoneLabel ? <span className="desk-pill-zone">{zoneLabel}</span> : null}
        </time>
      </span>

      {instruments.map((instrument) => (
        <MarketPill key={instrument.id} instrument={instrument} />
      ))}
    </div>
  );
}
