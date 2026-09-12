'use client';

import { useEffect, useState } from 'react';
import {
  classifyNewsIngestHealth,
  formatNewsLastPull,
} from '@/lib/news/ingest-freshness';

type Props = {
  lastSuccessfulIngestAt: string | null;
};

/**
 * Feed-level ingest health — uses checkpoint last_success_at, not article age or asOf.
 * Relative "Last pull" ticks client-side without an extra network poll.
 */
export function NewsIngestFreshness({ lastSuccessfulIngestAt }: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const health = classifyNewsIngestHealth(lastSuccessfulIngestAt, nowMs);
  const isLive = health === 'live';
  const label = isLive ? 'Live' : 'Stale';
  const pullLabel = formatNewsLastPull(lastSuccessfulIngestAt, nowMs);

  return (
    <div
      className="shrink-0 text-left sm:text-right"
      data-testid="news-ingest-freshness"
    >
      <p
        className={[
          'flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] sm:justify-end',
          isLive ? 'text-[var(--scoop-live)]' : 'text-[var(--muted)]',
        ].join(' ')}
        data-health={health}
        aria-live="polite"
      >
        <span
          className={[
            'inline-block h-1.5 w-1.5 rounded-full',
            isLive ? 'bg-[var(--scoop-live)]' : 'bg-[var(--muted)]',
          ].join(' ')}
          aria-hidden
        />
        {label}
      </p>
      <p
        className="mt-0.5 font-mono text-[10px] tracking-wide text-[var(--muted-2)]"
        data-testid="news-last-pull"
      >
        {pullLabel}
      </p>
    </div>
  );
}
