'use client';

import { useMemo, useState, useTransition } from 'react';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  DEFAULT_DISCOVER_TAB,
  DISCOVER_TABS,
  type DiscoverTabId,
} from '@/lib/discovery/tabs';
import type { DiscoverTabResult } from '@/lib/discovery/load-home';
import { quoteDisplaySymbol } from '@/lib/quotes/resolve';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { TokenDiscoveryItemCard } from '@/components/home/TokenDiscoveryItem';

type Props = {
  initialTab: DiscoverTabId;
  initialResult: DiscoverTabResult;
  /** Preloaded results for other data-available tabs (server). */
  preloaded: Partial<Record<DiscoverTabId, DiscoverTabResult>>;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

export function DiscoverSection({
  initialTab,
  initialResult,
  preloaded,
  catalogue,
}: Props) {
  const [tab, setTab] = useState<DiscoverTabId>(initialTab);
  const [cache, setCache] = useState<Partial<Record<DiscoverTabId, DiscoverTabResult>>>(() => ({
    [initialResult.tabId]: initialResult,
    ...preloaded,
  }));
  const [pending, startTransition] = useTransition();

  const result = cache[tab] ?? {
    tabId: tab,
    status: 'unavailable' as const,
    items: [] as TokenDiscoveryItem[],
    message: DISCOVER_TABS.find((t) => t.id === tab)?.emptyMessage,
  };

  const quoteFor = useMemo(
    () => (quoteAsset: string) => quoteDisplaySymbol(quoteAsset, catalogue),
    [catalogue],
  );

  function selectTab(next: DiscoverTabId) {
    startTransition(() => {
      setTab(next);
      if (!cache[next] && preloaded[next]) {
        setCache((prev) => ({ ...prev, [next]: preloaded[next] }));
      }
    });
  }

  return (
    <section aria-labelledby="discover-heading" className="border-b border-[var(--divider)]">
      <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14 lg:px-10">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionHeading>
              <span id="discover-heading">Discover</span>
            </SectionHeading>
            <p className="mt-3 max-w-lg text-sm text-[var(--muted)]">
              Token markets on Robinhood Chain — artwork first, no card soup.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Discovery filters"
            className="flex flex-wrap gap-x-4 gap-y-2 border-b border-[var(--divider)] pb-2 sm:border-0 sm:pb-0"
          >
            {DISCOVER_TABS.map((item) => {
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`discover-tab-${item.id}`}
                  onClick={() => selectTab(item.id)}
                  className={[
                    'min-h-11 font-mono text-[12px] uppercase tracking-[0.16em] transition-colors',
                    selected
                      ? 'text-[var(--fg)] underline decoration-[var(--scoop-orange)] decoration-2 underline-offset-8'
                      : 'text-[var(--muted)] hover:text-[var(--fg)]',
                  ].join(' ')}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          role="tabpanel"
          aria-busy={pending}
          className={pending ? 'opacity-70 transition-opacity' : ''}
        >
          {result.status === 'ok' && result.items.length > 0 ? (
            <div
              className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 xl:grid-cols-3"
              data-testid="discover-grid"
            >
              {result.items.map((token) => (
                <TokenDiscoveryItemCard
                  key={token.tokenAddress}
                  token={token}
                  quoteSymbol={quoteFor(token.quoteAsset)}
                />
              ))}
            </div>
          ) : (
            <DiscoverEmpty result={result} />
          )}
        </div>
      </div>
    </section>
  );
}

function DiscoverEmpty({ result }: { result: DiscoverTabResult }) {
  return (
    <div
      className="flex min-h-40 items-center border border-dashed border-[var(--divider)] px-6 py-10"
      role="status"
      data-testid="discover-empty"
    >
      <p className="text-sm text-[var(--muted)]">
        {result.message ??
          (result.status === 'error'
            ? 'Could not load markets.'
            : 'Nothing here yet.')}
      </p>
    </div>
  );
}

export { DEFAULT_DISCOVER_TAB };
