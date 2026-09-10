'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { NewsFreshnessBadge } from '@/components/news/NewsFreshnessBadge';
import { NewsMarketLiveControl } from '@/components/news/NewsMarketLiveControl';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';
import {
  NEWS_PAGE_SIZE,
  NEWS_UI_POLL_MS,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
} from '@/lib/news/public';
import { classifyNewsFreshness, isNewsFresh } from '@/lib/news/freshness';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  initial: PublicNewsFeedResponse;
  quoteCatalogue?: readonly PublicQuoteCatalogueItem[];
};

function mergeUnique(
  existing: PublicNewsItem[],
  incoming: PublicNewsItem[],
  mode: 'prepend' | 'append',
): PublicNewsItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const prev = byId.get(item.id);
    // Prefer fresher market counts from polls while preserving order mode.
    byId.set(item.id, prev ? { ...prev, ...item, markets: item.markets } : item);
  }
  if (mode === 'prepend') {
    const incomingIds = new Set(incoming.map((i) => i.id));
    const head = incoming.map((i) => byId.get(i.id)!);
    const tail = existing.filter((i) => !incomingIds.has(i.id)).map((i) => byId.get(i.id)!);
    return [...head, ...tail];
  }
  const existingIds = new Set(existing.map((i) => i.id));
  const head = existing.map((i) => byId.get(i.id)!);
  const tail = incoming.filter((i) => !existingIds.has(i.id)).map((i) => byId.get(i.id)!);
  return [...head, ...tail];
}

function NewsFeedItemRow({
  item,
  index,
  quoteCatalogue,
}: {
  item: PublicNewsItem;
  index: number;
  quoteCatalogue: readonly PublicQuoteCatalogueItem[];
}) {
  const isLead = index === 0;
  const freshness = classifyNewsFreshness(item.publishedAt);
  const fresh = isLead || isNewsFresh(freshness);
  const hasMarkets = item.marketCount > 0;

  return (
    <li className="py-2.5 first:pt-0 md:py-3">
      <article
        className={[
          isLead
            ? 'border-l-[3px] border-[var(--scoop-live)] pl-3'
            : fresh
              ? 'border-l-2 border-[var(--scoop-live)]/40 pl-2.5'
              : 'pl-0',
        ].join(' ')}
        data-testid="news-feed-item"
        data-lead={isLead ? 'true' : undefined}
        data-freshness={isLead ? 'latest' : freshness}
        data-market-count={String(item.marketCount)}
      >
        <h2
          className={[
            'max-w-3xl text-[15px] font-semibold leading-snug tracking-tight line-clamp-2 md:text-base md:leading-snug',
            fresh ? 'text-[var(--fg)]' : 'text-[var(--fg)]/90',
          ].join(' ')}
        >
          {item.headline}
        </h2>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <NewsFreshnessBadge publishedAt={item.publishedAt} isLead={isLead} />
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>{item.sourceDomain}</span>
            <span className="text-[var(--muted-2)]">{' '}·{' '}</span>
            <NewsAge iso={item.publishedAt} />
            {item.tickers.length > 0 ? (
              <>
                <span className="text-[var(--muted-2)]">{' '}·{' '}</span>
                <span className="text-[var(--muted-2)]">
                  {item.tickers.slice(0, 4).join(' · ')}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasMarkets ? (
            <NewsMarketLiveControl
              providerArticleId={item.id}
              marketCount={item.marketCount}
              markets={item.markets}
              quoteCatalogue={quoteCatalogue}
            />
          ) : null}
          <LaunchAsTokenLink
            providerArticleId={item.id}
            variant={hasMarkets ? 'another' : 'feed'}
          />
          <CtaLink
            href={item.url}
            external
            className="min-h-8 px-0 text-[10px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Read story ↗
          </CtaLink>
        </div>
      </article>
    </li>
  );
}

export function NewsFeed({ initial, quoteCatalogue = [] }: Props) {
  const [status, setStatus] = useState(initial.status);
  const [message, setMessage] = useState(initial.message);
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [pendingNew, setPendingNew] = useState<PublicNewsItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const itemsRef = useRef(items);
  const pendingRef = useRef(pendingNew);
  const topIdRef = useRef<string | null>(initial.items[0]?.id ?? null);
  const scrolledRef = useRef(false);
  const statusRef = useRef(status);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    pendingRef.current = pendingNew;
  }, [pendingNew]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const onScroll = () => {
      scrolledRef.current = window.scrollY > 120;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const poll = useCallback(async () => {
    if (statusRef.current === 'gated') return;
    try {
      const res = await fetch(`/api/news?limit=${NEWS_PAGE_SIZE}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as PublicNewsFeedResponse;
      if (data.status === 'gated' || data.status === 'error') {
        setStatus(data.status);
        setMessage(data.message);
        return;
      }
      if (data.status === 'empty') {
        setStatus('empty');
        setItems([]);
        setPendingNew([]);
        setNextCursor(null);
        setMessage(data.message);
        topIdRef.current = null;
        return;
      }

      setStatus('ok');
      const newest = data.items[0];
      const knownTop = topIdRef.current;
      if (newest && knownTop && newest.id !== knownTop && scrolledRef.current) {
        const knownIds = new Set([
          ...itemsRef.current.map((i) => i.id),
          ...pendingRef.current.map((i) => i.id),
        ]);
        const novel = data.items.filter((item) => !knownIds.has(item.id));
        if (novel.length > 0) {
          setPendingNew((prev) => mergeUnique(prev, novel, 'prepend'));
        }
        // Still refresh market state on visible rows without jumping scroll.
        setItems((prev) => mergeUnique(prev, data.items, 'prepend'));
        return;
      }

      setItems((prev) => {
        const merged = mergeUnique(prev, data.items, 'prepend');
        topIdRef.current = merged[0]?.id ?? null;
        return merged;
      });
      setPendingNew([]);
    } catch {
      /* keep showing last good feed */
    }
  }, []);

  useEffect(() => {
    if (status === 'gated') return;
    const id = window.setInterval(() => {
      void poll();
    }, NEWS_UI_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll, status]);

  useEffect(() => {
    if (status === 'gated') return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    const onFocus = () => {
      void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [poll, status]);

  function revealPending() {
    setItems((prev) => {
      const merged = mergeUnique(prev, pendingNew, 'prepend');
      topIdRef.current = merged[0]?.id ?? null;
      return merged;
    });
    setPendingNew([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/news?limit=${NEWS_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setLoadError('Could not load more stories.');
        return;
      }
      const data = (await res.json()) as PublicNewsFeedResponse;
      if (data.status === 'error') {
        setLoadError(data.message ?? 'Could not load more stories.');
        return;
      }
      setItems((prev) => mergeUnique(prev, data.items, 'append'));
      setNextCursor(data.nextCursor);
    } catch {
      setLoadError('Could not load more stories.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (status === 'gated') {
    return (
      <div className="space-y-2 py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-xl font-semibold tracking-tight">News display pending</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Public news display is not enabled yet.'}
        </p>
      </div>
    );
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className="space-y-2 py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Stories unavailable</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Could not load news.'}
        </p>
        <button
          type="button"
          onClick={() => void poll()}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === 'empty' || items.length === 0) {
    return (
      <div className="space-y-2 py-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-xl font-semibold tracking-tight">No stories yet.</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Fresh stories will appear here after ingestion.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {pendingNew.length > 0 ? (
        <div className="sticky top-[calc(var(--announcement-offset,0px)+0.75rem)] z-20 mb-4 flex justify-center">
          <button
            type="button"
            onClick={revealPending}
            className="rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90 motion-reduce:transition-none"
          >
            {pendingNew.length === 1
              ? '1 new story'
              : `${pendingNew.length} new stories`}
          </button>
        </div>
      ) : null}

      <ul className="divide-y divide-[var(--divider)]" data-testid="news-feed-list">
        {items.map((item, index) => (
          <NewsFeedItemRow
            key={item.id}
            item={item}
            index={index}
            quoteCatalogue={quoteCatalogue}
          />
        ))}
      </ul>

      {nextCursor ? (
        <div className="mt-6 flex flex-col items-stretch gap-2 sm:items-start">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50 sm:w-auto"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
          {loadError ? (
            <p className="font-mono text-[11px] text-[var(--muted)]">{loadError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
