'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import {
  DEFAULT_DISCOVER_TAB,
  DISCOVER_TABS,
  type DiscoverTabId,
} from '@/lib/discovery/tabs';
import type { DiscoverTabResult } from '@/lib/discovery/load-home';
import { quoteDisplaySymbol } from '@/lib/quotes/resolve';
import { TokenDiscoveryItemCard } from '@/components/home/TokenDiscoveryItem';

/** Lightweight discovery refresh — not trading-surface realtime. */
export const DISCOVER_REFRESH_MS = 15_000;

type Props = {
  initialTab: DiscoverTabId;
  initialResult: DiscoverTabResult;
  /** Preloaded results for other data-available tabs (server). */
  preloaded: Partial<Record<DiscoverTabId, DiscoverTabResult>>;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

async function fetchDiscoverTab(tabId: DiscoverTabId): Promise<DiscoverTabResult | null> {
  const tab = DISCOVER_TABS.find((t) => t.id === tabId);
  if (!tab?.dataAvailable || !tab.filter || !tab.sort) return null;

  const params = new URLSearchParams({
    chainId: String(SCOOP_CHAIN_ID),
    filter: tab.filter,
    sort: tab.sort,
    limit: '24',
  });
  const res = await fetch(`/api/tokens?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { items?: TokenDiscoveryItem[] };
  if (!Array.isArray(body.items)) return null;

  if (body.items.length === 0) {
    return {
      tabId,
      status: 'empty',
      items: [],
      message: tab.emptyMessage,
    };
  }
  return { tabId, status: 'ok', items: body.items };
}

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
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

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

  const refreshTab = useCallback(async (tabId: DiscoverTabId) => {
    const tabConfig = DISCOVER_TABS.find((t) => t.id === tabId);
    if (!tabConfig?.dataAvailable) return;
    try {
      const next = await fetchDiscoverTab(tabId);
      if (!next) return; // keep last good data
      setCache((prev) => ({ ...prev, [tabId]: next }));
    } catch {
      // keep last good data on network failure
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshTab(tab);
    }, DISCOVER_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [tab, refreshTab]);

  function selectTab(next: DiscoverTabId) {
    startTransition(() => {
      setTab(next);
      if (!cacheRef.current[next] && preloaded[next]) {
        setCache((prev) => ({ ...prev, [next]: preloaded[next] }));
      }
    });
  }

  return (
    <section aria-label="Markets" className="border-b border-[var(--divider)]">
      <div className="mx-auto max-w-[1400px] px-4 pt-3 pb-10 md:px-8 md:pt-4 md:pb-14 lg:px-10">
        <div
          role="tablist"
          aria-label="Market filters"
          className="mb-8 flex flex-wrap justify-start gap-x-4 gap-y-2 border-b border-[var(--divider)] pb-2"
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
                  'min-h-11 font-mono text-[12px] uppercase tracking-[0.18em] transition-colors',
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
