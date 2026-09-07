'use client';

import { useMemo, useState } from 'react';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
  catalogue: readonly PublicQuoteCatalogueItem[];
  quoteWarning?: string | null;
  onSelect: (quoteAsset: string, quoteSymbol: string) => void;
};

function QuoteIcon({ item }: { item: PublicQuoteCatalogueItem }) {
  const label = item.displaySymbol || item.symbol;
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt=""
        width={48}
        height={48}
        className="h-11 w-11 rounded-[var(--radius-md)] object-cover sm:h-12 sm:w-12"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] font-mono text-[11px] font-medium text-[var(--scoop-orange-contrast)] sm:h-12 sm:w-12"
    >
      {label.slice(0, 3)}
    </span>
  );
}

export function MarketStep({ state, errors, catalogue, quoteWarning, onSelect }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((item) => {
      const hay = `${item.displaySymbol} ${item.symbol} ${item.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalogue, query]);

  const selected = useMemo(
    () =>
      catalogue.find(
        (item) =>
          state.quoteAsset != null &&
          item.quoteAsset.toLowerCase() === state.quoteAsset.toLowerCase(),
      ) ?? null,
    [catalogue, state.quoteAsset],
  );

  return (
    <div className="space-y-3.5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          What should your token trade against?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose what your token trades against — ETH, stocks, or stables.
        </p>
      </div>

      <input
        id="quote-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search quotes · NVDA, ETH, USDG…"
        aria-label="Search quotes"
        className="w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 text-[15px] outline-none placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]"
      />

      {errors.quoteAsset ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          {errors.quoteAsset}
        </p>
      ) : null}

      {quoteWarning ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="status">
          {quoteWarning}
        </p>
      ) : null}

      {catalogue.length === 0 ? (
        <p className="font-mono text-[12px] text-[var(--muted)]" role="status">
          Quote catalogue unavailable. Check database connectivity.
        </p>
      ) : (
        <>
          <ul
            className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 md:gap-2.5"
            role="listbox"
            aria-label="Quote assets"
          >
            {filtered.map((item) => {
              const isSelected =
                state.quoteAsset?.toLowerCase() === item.quoteAsset.toLowerCase();
              const symbol = item.displaySymbol || item.symbol;
              return (
                <li key={item.quoteAsset}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`${symbol} — ${item.name}`}
                    title={item.name}
                    onClick={() => onSelect(item.quoteAsset, symbol)}
                    className={[
                      'flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-lg)] border px-1.5 py-2.5 transition-colors',
                      isSelected
                        ? 'border-[var(--scoop-orange)] bg-[var(--bg-elevated)]'
                        : 'border-transparent hover:border-[var(--divider)] hover:bg-[var(--bg-elevated)]/70',
                    ].join(' ')}
                  >
                    <QuoteIcon item={item} />
                    <span className="font-mono text-[11px] tracking-wide text-[var(--fg)]">
                      {symbol}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {filtered.length === 0 ? (
            <p className="font-mono text-[12px] text-[var(--muted)]">
              No quotes match that search.
            </p>
          ) : null}

          {selected ? (
            <p className="font-mono text-[12px] text-[var(--muted)]" role="status">
              Selected ·{' '}
              <span className="text-[var(--fg)]">{selected.displaySymbol || selected.symbol}</span>
              <span className="text-[var(--muted-2)]"> · {selected.name}</span>
            </p>
          ) : (
            <p className="font-mono text-[12px] text-[var(--muted-2)]" role="status">
              {catalogue.length} quotes available
            </p>
          )}
        </>
      )}
    </div>
  );
}
