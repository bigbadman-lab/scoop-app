'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { formatCompactAge, displayUsd, formatCompactUsdMarketValue } from '@/lib/format';
import { formatNewsMarketStatusLabel } from '@/lib/news/ingest-freshness';
import { quoteDisplaySymbol } from '@/lib/quotes/resolve';
import type { PublicNewsMarketSummary } from '@/lib/news/public';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  providerArticleId: string;
  marketCount: number;
  markets?: readonly PublicNewsMarketSummary[];
  quoteCatalogue?: readonly PublicQuoteCatalogueItem[];
  /** Dark hero overlay (homepage). */
  tone?: 'default' | 'onDark';
  className?: string;
};

function tickerLabel(symbol: string): string {
  const s = symbol.trim().replace(/^\$/, '');
  return s ? `$${s}` : '$—';
}

function MarketRow({
  market,
  quoteCatalogue,
  onNavigate,
}: {
  market: PublicNewsMarketSummary;
  quoteCatalogue: readonly PublicQuoteCatalogueItem[];
  onNavigate?: () => void;
}) {
  const quote = quoteDisplaySymbol(market.quoteAsset, quoteCatalogue) ?? '—';
  const price = displayUsd(market.priceUsdDisplay);
  const fdv = formatCompactUsdMarketValue(market.fdvUsdDisplay);
  return (
    <Link
      href={`/token/${encodeURIComponent(market.tokenAddress)}`}
      className="block border-b border-[var(--divider)] px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-2)] focus-visible:bg-[var(--surface-2)] focus-visible:outline-none"
      onClick={onNavigate}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-[var(--fg)]">
          {tickerLabel(market.symbol)}
          <span className="text-[var(--muted-2)]"> / {quote}</span>
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
          {formatCompactAge(market.ageSeconds)}
        </p>
      </div>
      <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
        {price ? `Price ${price}` : 'Price —'}
        <span className="text-[var(--muted-2)]"> · </span>
        {fdv ? `FDV ${fdv}` : 'FDV —'}
      </p>
    </Link>
  );
}

const livePillClass =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,white)] px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg)] shadow-[0_1px_2px_rgba(10,10,10,0.04)]';

const livePillOnDarkClass =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-white/25 bg-white/95 px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--fg)] shadow-[0_1px_2px_rgba(0,0,0,0.2)]';

const zeroPillClass =
  'inline-flex min-h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-transparent px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]';

const zeroPillOnDarkClass =
  'inline-flex min-h-8 shrink-0 items-center rounded-[var(--radius-md)] border border-white/20 bg-black/25 px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-white/75';

/**
 * Presentation-only market status for a news article.
 * Uses canonical marketCount — does not query the database.
 * One market → /token/[address]; many → existing compact selector.
 */
export function NewsMarketStatus({
  providerArticleId,
  marketCount,
  markets = [],
  quoteCatalogue = [],
  tone = 'default',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<PublicNewsMarketSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const label = formatNewsMarketStatusLabel(marketCount);
  const primary = markets[0] ?? null;
  const needsFetch = marketCount > markets.length;
  const livePill = tone === 'onDark' ? livePillOnDarkClass : livePillClass;
  const zeroPill = tone === 'onDark' ? zeroPillOnDarkClass : zeroPillClass;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !needsFetch || remote) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/news/${encodeURIComponent(providerArticleId)}/markets`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { items?: PublicNewsMarketSummary[] };
        if (!cancelled) setRemote(body.items ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, needsFetch, providerArticleId, remote]);

  if (marketCount <= 0) {
    return (
      <span
        className={[zeroPill, className].filter(Boolean).join(' ')}
        data-testid="news-market-status"
        data-market-count="0"
        data-interactive="false"
      >
        {label}
      </span>
    );
  }

  if (marketCount === 1 && primary) {
    return (
      <Link
        href={`/token/${encodeURIComponent(primary.tokenAddress)}`}
        className={[livePill, 'transition-opacity hover:opacity-90', className]
          .filter(Boolean)
          .join(' ')}
        data-testid="news-market-status"
        data-market-count="1"
        data-interactive="true"
        aria-label={`${label} — open ${tickerLabel(primary.symbol)}`}
      >
        <span className="text-[var(--scoop-live)]" aria-hidden>
          ●
        </span>
        <span>{label}</span>
      </Link>
    );
  }

  const list = remote ?? markets;

  return (
    <div ref={rootRef} className={['relative inline-flex', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={[livePill, 'transition-opacity hover:opacity-90'].join(' ')}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        data-testid="news-market-status"
        data-market-count={String(marketCount)}
        data-interactive="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[var(--scoop-live)]" aria-hidden>
          ●
        </span>
        <span>{label}</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close markets"
            onClick={close}
          />
          <div
            id={panelId}
            role="dialog"
            aria-label="Markets from this story"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-[var(--radius-md)] border border-[var(--divider)] bg-[var(--surface)] shadow-lg md:absolute md:inset-auto md:bottom-auto md:left-0 md:top-full md:mt-2 md:w-[min(100vw-2rem,20rem)] md:max-h-72 md:rounded-[var(--radius-md)]"
          >
            <p className="sticky top-0 border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Markets from this story
            </p>
            {loading && list.length === 0 ? (
              <p className="px-3 py-3 font-mono text-[11px] text-[var(--muted)]">Loading…</p>
            ) : (
              list.map((m) => (
                <MarketRow
                  key={`${m.chainId}:${m.tokenAddress}`}
                  market={m}
                  quoteCatalogue={quoteCatalogue}
                  onNavigate={close}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** @deprecated Prefer NewsMarketStatus — retained alias during N2 cutover. */
export const NewsMarketLiveControl = NewsMarketStatus;
