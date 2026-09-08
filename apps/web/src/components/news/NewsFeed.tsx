'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { NewsFreshnessBadge } from '@/components/news/NewsFreshnessBadge';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';
import {
  NEWS_PAGE_SIZE,
  NEWS_UI_POLL_MS,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
} from '@/lib/news/public';
import { classifyNewsFreshness, isNewsFresh } from '@/lib/news/freshness';

type Props = {
  initial: PublicNewsFeedResponse;
};

function mergeUnique(
  existing: PublicNewsItem[],
  incoming: PublicNewsItem[],
  mode: 'prepend' | 'append',
): PublicNewsItem[] {
  const seen = new Set(existing.map((item) => item.id));
  const fresh = incoming.filter((item) => !seen.has(item.id));
  return mode === 'prepend' ? [...fresh, ...existing] : [...existing, ...fresh];
}

function NewsFeedItemRow({
  item,
  index,
}: {
  item: PublicNewsItem;
  index: number;
}) {
  const isLead = index === 0;
  const freshness = classifyNewsFreshness(item.publishedAt);
  const fresh = isLead || isNewsFresh(freshness);

  return (
    <li
      className={[
        'py-6 first:pt-0 md:py-7',
        isLead ? 'md:pb-9' : '',
      ].join(' ')}
    >
      <article
        className={[
          'space-y-2',
          isLead
            ? 'border-l-[3px] border-[var(--scoop-live)] pl-4 md:pl-5'
            : fresh
              ? 'border-l-2 border-[var(--scoop-live)]/45 pl-3.5 md:pl-4'
              : '',
        ].join(' ')}
        data-testid="news-feed-item"
        data-lead={isLead ? 'true' : undefined}
        data-freshness={isLead ? 'latest' : freshness}
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <NewsFreshnessBadge publishedAt={item.publishedAt} isLead={isLead} />
          <p
            className={[
              'font-mono text-[11px] uppercase tracking-[0.16em]',
              fresh ? 'text-[var(--scoop-live)]' : 'text-[var(--muted)]',
            ].join(' ')}
          >
            <NewsAge
              iso={item.publishedAt}
              className={fresh ? 'text-[var(--scoop-live)]' : undefined}
            />
            <span className={fresh ? 'text-[var(--scoop-live)]/55' : 'text-[var(--muted-2)]'}>
              {' '}
              ·{' '}
            </span>
            <span className={fresh ? 'text-[var(--muted)]' : undefined}>
              {item.sourceDomain}
            </span>
          </p>
        </div>

        <h2
          className={[
            'max-w-3xl tracking-tight',
            isLead
              ? 'text-2xl font-semibold text-[var(--fg)] md:text-3xl'
              : fresh
                ? 'text-xl font-semibold text-[var(--fg)] md:text-2xl'
                : 'text-lg font-semibold text-[var(--fg)]/90 md:text-xl',
          ].join(' ')}
        >
          {item.headline}
        </h2>

        {item.tickers.length > 0 ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            {item.tickers.slice(0, 6).join(' · ')}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <LaunchAsTokenLink providerArticleId={item.id} />
          <CtaLink href={item.url} external>
            Read story ↗
          </CtaLink>
        </div>
      </article>
    </li>
  );
}

export function NewsFeed({ initial }: Props) {
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
      <div className="space-y-3 py-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">News display pending</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Public news display is not enabled yet.'}
        </p>
      </div>
    );
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className="space-y-3 py-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">Stories unavailable</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Could not load news.'}
        </p>
        <button
          type="button"
          onClick={() => void poll()}
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (status === 'empty' || items.length === 0) {
    return (
      <div className="space-y-3 py-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Desk
        </p>
        <h2 className="text-2xl font-semibold tracking-tight">No stories yet.</h2>
        <p className="max-w-md text-sm text-[var(--muted)]">
          {message ?? 'Fresh stories will appear here after ingestion.'}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {pendingNew.length > 0 ? (
        <div className="sticky top-[calc(var(--announcement-offset,0px)+0.75rem)] z-20 mb-6 flex justify-center">
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

      <ul className="divide-y divide-[var(--divider)]" aria-label="News feed">
        {items.map((item, index) => (
          <NewsFeedItemRow key={item.id} item={item} index={index} />
        ))}
      </ul>

      {nextCursor ? (
        <div className="border-t border-[var(--divider)] pt-8">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] transition-colors hover:border-[var(--fg)] disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
          {loadError ? (
            <p className="mt-3 font-mono text-[11px] text-[#b42318]" role="alert">
              {loadError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
