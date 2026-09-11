'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  DEFAULT_DISCOVER_TAB,
  DISCOVER_LIVE_POLL_MS,
  DISCOVER_TABS,
  type DiscoverTabId,
} from '@/lib/discovery/tabs';
import type { DiscoverSnapshot, DiscoverTabResult } from '@/lib/discovery/load-home';
import { fetchDiscoverSnapshot } from '@/lib/discovery/fetch-discover';
import { createLivePoll } from '@/lib/live/create-live-poll';
import { buildQuoteLookup, quoteDisplaySymbol } from '@/lib/quotes/resolve';
import { TokenDiscoveryItemCard } from '@/components/home/TokenDiscoveryItem';

/** @deprecated Prefer DISCOVER_LIVE_POLL_MS — kept for test imports during migration. */
export const DISCOVER_REFRESH_MS = DISCOVER_LIVE_POLL_MS;

type Props = {
  initialTab: DiscoverTabId;
  initialSnapshot: DiscoverSnapshot;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

export function DiscoverSection({
  initialTab,
  initialSnapshot,
  catalogue,
}: Props) {
  const [tab, setTab] = useState<DiscoverTabId>(initialTab);
  const [snapshot, setSnapshot] = useState<DiscoverSnapshot>(initialSnapshot);
  const [pending, startTransition] = useTransition();
  const pollRef = useRef<ReturnType<typeof createLivePoll<DiscoverSnapshot>> | null>(null);

  useEffect(() => {
    const poll = createLivePoll<DiscoverSnapshot>({
      pollMs: DISCOVER_LIVE_POLL_MS,
      initial: initialSnapshot,
      fetchSnapshot: async ({ signal }) => fetchDiscoverSnapshot(signal),
      onSnapshot: (next) => {
        setSnapshot(next);
      },
    });
    pollRef.current = poll;
    poll.start();
    return () => {
      poll.stop();
      pollRef.current = null;
    };
    // Mount once with SSR snapshot; live poll owns subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  const result: DiscoverTabResult = snapshot[tab] ?? {
    tabId: tab,
    status: 'unavailable',
    items: [] as TokenDiscoveryItem[],
    message: DISCOVER_TABS.find((t) => t.id === tab)?.emptyMessage,
  };

  const quoteLookup = useMemo(() => buildQuoteLookup(catalogue), [catalogue]);
  const quoteFor = useMemo(
    () => (quoteAsset: string) => {
      const key = quoteAsset.trim().toLowerCase();
      const hit = quoteLookup.get(key);
      return {
        symbol: quoteDisplaySymbol(quoteAsset, catalogue),
        imageUrl: hit?.imageUrl ?? null,
      };
    },
    [catalogue, quoteLookup],
  );

  function selectTab(next: DiscoverTabId) {
    startTransition(() => {
      setTab(next);
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
              className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              data-testid="discover-grid"
            >
              {result.items.map((token) => {
                const quote = quoteFor(token.quoteAsset);
                return (
                  <TokenDiscoveryItemCard
                    key={token.tokenAddress}
                    token={token}
                    quoteSymbol={quote.symbol}
                    quoteImageUrl={quote.imageUrl}
                  />
                );
              })}
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

export { DEFAULT_DISCOVER_TAB, DISCOVER_LIVE_POLL_MS };
