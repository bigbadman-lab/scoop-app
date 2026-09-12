'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { NewsFeedCategory } from '@scoop/news';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { NewsCategoryBrowse } from '@/components/news/NewsCategoryBrowse';
import { NewsFreshnessBadge } from '@/components/news/NewsFreshnessBadge';
import { NewsIngestFreshness } from '@/components/news/NewsIngestFreshness';
import { NewsMarketStatus } from '@/components/news/NewsMarketStatus';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';
import {
  NEWS_CATEGORY_COPY,
  newsCategoryHref,
  resolveNewsPageCategory,
} from '@/lib/news/category';
import {
  NEWS_PAGE_SIZE,
  NEWS_UI_POLL_MS,
  type PublicNewsFeedResponse,
  type PublicNewsItem,
} from '@/lib/news/public';
import { classifyNewsFreshness, isNewsFresh } from '@/lib/news/freshness';
import {
  NEWS_LEAD_FADE_MS,
  NEWS_LEAD_ROTATION_MS,
  leadArticleIndex,
  leadPoolSignature,
  nextLeadArticleId,
  reconcileLeadArticleId,
  shouldRotateNewsLead,
  splitNewsLeadFeed,
} from '@/lib/news/lead-rotation';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  initial: PublicNewsFeedResponse;
  quoteCatalogue?: readonly PublicQuoteCatalogueItem[];
};

function NewsDeskHeader({
  lastSuccessfulIngestAt,
}: {
  lastSuccessfulIngestAt: string | null;
}) {
  return (
    <header className="mb-2" data-testid="news-desk-header">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        News
      </p>
      <div className="mt-0.5 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Market feed</h1>
        <NewsIngestFreshness lastSuccessfulIngestAt={lastSuccessfulIngestAt} />
      </div>
    </header>
  );
}

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

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

function StoryBody({
  item,
  quoteCatalogue,
  variant = 'feed',
}: {
  item: PublicNewsItem;
  quoteCatalogue: readonly PublicQuoteCatalogueItem[];
  variant?: 'feed' | 'lead';
}) {
  const freshness = classifyNewsFreshness(item.publishedAt);
  const fresh = variant === 'lead' || isNewsFresh(freshness);
  const isLead = variant === 'lead';

  return (
    <>
      <h2
        className={[
          'max-w-3xl font-semibold tracking-tight',
          isLead
            ? 'text-lg leading-snug text-[var(--fg)] line-clamp-3 md:text-xl md:leading-[1.2]'
            : [
                'text-[15px] leading-snug line-clamp-2 md:text-base md:leading-snug',
                fresh ? 'text-[var(--fg)]' : 'text-[var(--fg)]/90',
              ].join(' '),
        ].join(' ')}
      >
        {item.headline}
      </h2>

      <div
        className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
        data-testid="news-feed-meta"
      >
        {isLead ? null : (
          <NewsFreshnessBadge publishedAt={item.publishedAt} />
        )}
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
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
          <span className="text-[var(--muted-2)]">{' '}·{' '}</span>
          <NewsMarketStatus
            providerArticleId={item.id}
            marketCount={item.marketCount}
            markets={item.markets}
            quoteCatalogue={quoteCatalogue}
            variant="feed"
          />
        </div>
      </div>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"
        data-testid="news-feed-actions"
      >
        <LaunchAsTokenLink
          providerArticleId={item.id}
          variant={item.marketCount > 0 ? 'another' : 'feed'}
        />
        <CtaLink
          href={item.url}
          external
          className="min-h-7 px-0 text-[10px] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Read story ↗
        </CtaLink>
      </div>
    </>
  );
}

function NewsFeedStaticRow({
  item,
  quoteCatalogue,
}: {
  item: PublicNewsItem;
  quoteCatalogue: readonly PublicQuoteCatalogueItem[];
}) {
  const freshness = classifyNewsFreshness(item.publishedAt);
  const fresh = isNewsFresh(freshness);

  return (
    <li className="border-b border-[var(--divider)] pb-6 pt-5 last:border-b-0 last:pb-0">
      <article
        className={fresh ? 'border-l-2 border-[var(--scoop-live)]/40 pl-2.5' : 'pl-0'}
        data-testid="news-feed-item"
        data-freshness={freshness}
        data-market-count={String(item.marketCount)}
      >
        <StoryBody item={item} quoteCatalogue={quoteCatalogue} />
      </article>
    </li>
  );
}

function NewsLeadSlot({
  pool,
  quoteCatalogue,
}: {
  pool: PublicNewsItem[];
  quoteCatalogue: readonly PublicQuoteCatalogueItem[];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const poolSig = leadPoolSignature(pool);
  const [activeId, setActiveId] = useState<string | null>(() => pool[0]?.id ?? null);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [opacity, setOpacity] = useState(1);
  const [displayed, setDisplayed] = useState<PublicNewsItem | null>(pool[0] ?? null);
  const paused = hovering || focused;

  // Reconcile active id when the lead pool snapshot changes (poll / reveal).
  useEffect(() => {
    setActiveId((prev) => reconcileLeadArticleId(pool, prev));
    // poolSig captures identity/order; avoid resetting on referential churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolSig]);

  const target = useMemo(() => {
    const id = reconcileLeadArticleId(pool, activeId);
    return pool.find((item) => item.id === id) ?? pool[0] ?? null;
  }, [pool, activeId]);

  const targetId = target?.id ?? null;
  const displayedId = displayed?.id ?? null;
  const canRotate = shouldRotateNewsLead(pool.length);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!canRotate || paused || tabHidden) return;
    const id = window.setInterval(() => {
      setActiveId((prev) => nextLeadArticleId(pool, prev));
    }, NEWS_LEAD_ROTATION_MS);
    return () => window.clearInterval(id);
  }, [canRotate, paused, tabHidden, poolSig, pool]);

  useEffect(() => {
    if (!target) {
      setDisplayed(null);
      setOpacity(1);
      return;
    }
    // Same identity: refresh payload (poll market updates) without a fade.
    if (targetId === displayedId) {
      setDisplayed(target);
      setOpacity(1);
      return;
    }
    if (reducedMotion || !displayedId) {
      setDisplayed(target);
      setOpacity(1);
      return;
    }
    setOpacity(0);
    const id = window.setTimeout(() => {
      setDisplayed(target);
      setOpacity(1);
    }, NEWS_LEAD_FADE_MS / 2);
    return () => window.clearTimeout(id);
  }, [targetId, target, displayedId, reducedMotion]);

  if (!displayed) return null;

  const newestId = pool[0]?.id ?? null;
  const isLatest = displayed.id === newestId;
  const position = leadArticleIndex(pool, displayed.id);
  const markerLabel = isLatest ? 'Latest' : 'Live story';
  const positionLabel =
    pool.length > 1 && position >= 0 ? `${position + 1} of ${pool.length}` : null;

  return (
    <div
      className="border-b border-[var(--divider)] pb-6"
      data-testid="news-lead-slot"
      data-lead-id={displayed.id}
      data-lead-paused={paused ? 'true' : 'false'}
      data-lead-count={String(pool.length)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        setFocused(false);
      }}
    >
      <article
        data-testid="news-feed-item"
        data-lead="true"
        data-freshness={isLatest ? 'latest' : 'live_story'}
        data-market-count={String(displayed.marketCount)}
      >
        <div
          style={{
            opacity,
            transitionProperty: reducedMotion ? 'none' : 'opacity',
            transitionDuration: `${NEWS_LEAD_FADE_MS}ms`,
          }}
          data-testid="news-lead-content"
        >
          <p
            className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]"
            data-testid="news-lead-kicker"
            aria-hidden
          >
            <span className="inline-flex items-center gap-1.5 text-[var(--scoop-live)]">
              <span
                className="news-fresh-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--scoop-live)]"
                data-pulse={isLatest ? 'true' : undefined}
                aria-hidden
              />
              {markerLabel}
            </span>
            {positionLabel ? (
              <>
                <span className="text-[var(--muted-2)]" aria-hidden>
                  ·
                </span>
                <span
                  className="text-[var(--muted-2)]"
                  data-testid="news-lead-position"
                >
                  {positionLabel}
                </span>
              </>
            ) : null}
          </p>
          <StoryBody
            item={displayed}
            quoteCatalogue={quoteCatalogue}
            variant="lead"
          />
        </div>
      </article>
    </div>
  );
}

function applyFeedSnapshot(
  data: PublicNewsFeedResponse,
  setters: {
    setStatus: (s: PublicNewsFeedResponse['status']) => void;
    setMessage: (m: string | undefined) => void;
    setItems: (items: PublicNewsItem[]) => void;
    setPendingNew: (items: PublicNewsItem[]) => void;
    setNextCursor: (c: string | null) => void;
    setLastSuccessfulIngestAt: (v: string | null) => void;
    topIdRef: { current: string | null };
  },
) {
  if (data.lastSuccessfulIngestAt !== undefined) {
    setters.setLastSuccessfulIngestAt(data.lastSuccessfulIngestAt);
  }
  if (data.status === 'gated' || data.status === 'error') {
    setters.setStatus(data.status);
    setters.setMessage(data.message);
    if (data.status === 'error') {
      setters.setItems([]);
      setters.setPendingNew([]);
      setters.setNextCursor(null);
      setters.topIdRef.current = null;
    }
    return;
  }
  if (data.status === 'empty') {
    setters.setStatus('empty');
    setters.setItems([]);
    setters.setPendingNew([]);
    setters.setNextCursor(null);
    setters.setMessage(data.message);
    setters.topIdRef.current = null;
    return;
  }
  setters.setStatus('ok');
  setters.setMessage(undefined);
  setters.setItems(data.items);
  setters.setPendingNew([]);
  setters.setNextCursor(data.nextCursor);
  setters.topIdRef.current = data.items[0]?.id ?? null;
}

export function NewsFeed({ initial, quoteCatalogue = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState<NewsFeedCategory>(initial.category);
  const [status, setStatus] = useState(initial.status);
  const [message, setMessage] = useState(initial.message);
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [pendingNew, setPendingNew] = useState<PublicNewsItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [feedOpacity, setFeedOpacity] = useState(1);
  const [lastSuccessfulIngestAt, setLastSuccessfulIngestAt] = useState(
    initial.lastSuccessfulIngestAt,
  );

  const itemsRef = useRef(items);
  const pendingRef = useRef(pendingNew);
  const topIdRef = useRef<string | null>(initial.items[0]?.id ?? null);
  const scrolledRef = useRef(false);
  const statusRef = useRef(status);
  const categoryRef = useRef(category);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** While set, ignore URL→state sync until the router catches up to this category. */
  const pendingUrlCategoryRef = useRef<NewsFeedCategory | null>(null);
  const reducedMotion = usePrefersReducedMotion();

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
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    const onScroll = () => {
      scrolledRef.current = window.scrollY > 120;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const syncUrl = useCallback(
    (next: NewsFeedCategory) => {
      const href = newsCategoryHref(next);
      const urlCategory = resolveNewsPageCategory(searchParams.get('category'));
      const raw = searchParams.get('category');
      // Already on canonical URL (Stocks = /news with no category param).
      if (urlCategory === next && !(next === 'stocks' && raw != null)) return;
      router.replace(href, { scroll: false });
    },
    [router, searchParams],
  );

  const loadCategory = useCallback(
    async (next: NewsFeedCategory, opts?: { fromUrl?: boolean }) => {
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setCategory(next);
      categoryRef.current = next;
      if (!opts?.fromUrl) {
        pendingUrlCategoryRef.current = next;
        syncUrl(next);
      } else {
        pendingUrlCategoryRef.current = null;
      }

      setSwitching(true);
      setLoadError(null);
      setPendingNew([]);
      setNextCursor(null);
      setItems([]);
      topIdRef.current = null;
      if (!reducedMotion) setFeedOpacity(0.35);

      try {
        const res = await fetch(
          `/api/news?category=${next}&limit=${NEWS_PAGE_SIZE}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (requestId !== requestIdRef.current || categoryRef.current !== next) {
          return;
        }
        if (!res.ok) {
          setStatus('error');
          setMessage('Could not load news.');
          setItems([]);
          return;
        }
        const data = (await res.json()) as PublicNewsFeedResponse;
        if (requestId !== requestIdRef.current || categoryRef.current !== next) {
          return;
        }
        // Never apply a response for a different category (defense in depth).
        if (data.category && data.category !== next) return;
        applyFeedSnapshot(data, {
          setStatus,
          setMessage,
          setItems,
          setPendingNew,
          setNextCursor,
          setLastSuccessfulIngestAt,
          topIdRef,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (requestId !== requestIdRef.current || categoryRef.current !== next) {
          return;
        }
        setStatus('error');
        setMessage('Could not load news.');
        setItems([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setSwitching(false);
          setFeedOpacity(1);
        }
      }
    },
    [reducedMotion, syncUrl],
  );

  // Browser back/forward: URL is source of truth when it diverges.
  // While a client selection is awaiting router.replace, do not snap back to the old URL.
  useEffect(() => {
    const fromUrl = resolveNewsPageCategory(searchParams.get('category'));
    if (pendingUrlCategoryRef.current != null) {
      if (fromUrl === pendingUrlCategoryRef.current) {
        pendingUrlCategoryRef.current = null;
      }
      return;
    }
    if (fromUrl === categoryRef.current) return;
    void loadCategory(fromUrl, { fromUrl: true });
  }, [searchParams, loadCategory]);

  const poll = useCallback(async () => {
    if (statusRef.current === 'gated') return;
    const activeCategory = categoryRef.current;
    const requestId = requestIdRef.current;
    try {
      const res = await fetch(
        `/api/news?category=${activeCategory}&limit=${NEWS_PAGE_SIZE}`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      if (requestId !== requestIdRef.current || categoryRef.current !== activeCategory) {
        return;
      }
      const data = (await res.json()) as PublicNewsFeedResponse;
      if (requestId !== requestIdRef.current || categoryRef.current !== activeCategory) {
        return;
      }
      if (data.category && data.category !== activeCategory) return;

      if (data.lastSuccessfulIngestAt !== undefined) {
        setLastSuccessfulIngestAt(data.lastSuccessfulIngestAt);
      }
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
      setNextCursor(data.nextCursor);
    } catch {
      /* keep showing last good feed */
    }
  }, []);

  useEffect(() => {
    if (status === 'gated' || switching) return;
    const id = window.setInterval(() => {
      void poll();
    }, NEWS_UI_POLL_MS);
    return () => window.clearInterval(id);
  }, [poll, status, switching, category]);

  useEffect(() => {
    if (status === 'gated' || switching) return;
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
  }, [poll, status, switching, category]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

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
    if (!nextCursor || loadingMore || switching) return;
    const activeCategory = category;
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/news?category=${activeCategory}&limit=${NEWS_PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: 'no-store' },
      );
      if (requestId !== requestIdRef.current || categoryRef.current !== activeCategory) {
        return;
      }
      if (!res.ok) {
        setLoadError('Could not load more stories.');
        return;
      }
      const data = (await res.json()) as PublicNewsFeedResponse;
      if (requestId !== requestIdRef.current || categoryRef.current !== activeCategory) {
        return;
      }
      if (data.category && data.category !== activeCategory) return;
      if (data.status === 'error') {
        setLoadError(data.message ?? 'Could not load more stories.');
        return;
      }
      setItems((prev) => mergeUnique(prev, data.items, 'append'));
      setNextCursor(data.nextCursor);
    } catch {
      if (requestId === requestIdRef.current && categoryRef.current === activeCategory) {
        setLoadError('Could not load more stories.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingMore(false);
      }
    }
  }

  function onSelectCategory(next: NewsFeedCategory) {
    if (next === category && !switching) return;
    void loadCategory(next);
  }

  const { leadPool, staticFeed } = splitNewsLeadFeed(items);
  const categoryLabel = NEWS_CATEGORY_COPY[category].label;

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

  const emptyCopy =
    category === 'markets'
      ? {
          title: 'No Markets stories yet.',
          body: message && message !== 'No stories yet.' ? message : null,
        }
      : {
          title: 'No stories yet.',
          body: message ?? 'Fresh stories will appear here after ingestion.',
        };

  return (
    <div className="relative" data-testid="news-feed" data-category={category}>
      <NewsDeskHeader lastSuccessfulIngestAt={lastSuccessfulIngestAt} />
      <NewsCategoryBrowse
        selected={category}
        onSelect={onSelectCategory}
      />

      <div
        style={{
          opacity: feedOpacity,
          transitionProperty: reducedMotion ? 'none' : 'opacity',
          transitionDuration: '180ms',
        }}
        data-testid="news-feed-body"
        data-switching={switching ? 'true' : 'false'}
      >
        {switching ? (
          <div className="space-y-2 py-8" data-testid="news-category-loading">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Loading {categoryLabel}…
            </p>
          </div>
        ) : status === 'error' && items.length === 0 ? (
          <div className="space-y-2 py-8">
            <h2 className="text-xl font-semibold tracking-tight">Stories unavailable</h2>
            <p className="max-w-md text-sm text-[var(--muted)]">
              {message ?? 'Could not load news.'}
            </p>
            <button
              type="button"
              onClick={() => void loadCategory(category)}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-4 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : status === 'empty' || items.length === 0 ? (
          <div className="space-y-2 py-8" data-testid="news-empty-state">
            <h2 className="text-xl font-semibold tracking-tight">{emptyCopy.title}</h2>
            {emptyCopy.body ? (
              <p className="max-w-md text-sm text-[var(--muted)]">{emptyCopy.body}</p>
            ) : null}
          </div>
        ) : (
          <>
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

            <NewsLeadSlot
              key={category}
              pool={leadPool}
              quoteCatalogue={quoteCatalogue}
            />

            <ul data-testid="news-feed-list">
              {staticFeed.map((item) => (
                <NewsFeedStaticRow
                  key={item.id}
                  item={item}
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
          </>
        )}
      </div>
    </div>
  );
}
