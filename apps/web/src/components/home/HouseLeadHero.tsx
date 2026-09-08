'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { HOUSE_IMAGE_SET } from '@/lib/brand';
import { NewsAge } from '@/components/news/NewsAge';
import { CtaLink } from '@/components/ui/CtaLink';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';
import type { LeadNewsResult } from '@/lib/news/load-home';
import type { NewsFeedItem } from '@scoop/news';
import {
  HOMEPAGE_NEWS_FADE_MS,
  HOMEPAGE_NEWS_ROTATION_MS,
  HOMEPAGE_VISIBLE_NEWS_SLOTS,
  homepageArticlesSignature,
  nextHomepageNewsOffset,
  shouldRotateHomepageNews,
  visibleHomepageArticles,
} from '@/lib/news/homepage-rotation';

export const HOUSE_ROTATE_MS = 10_000;
export const HOUSE_FADE_MS = 500;
/** Cooldown so hover doesn't thrash through the set. */
export const HOUSE_HOVER_ADVANCE_MS = 900;

export {
  HOMEPAGE_NEWS_ROTATION_MS,
  HOMEPAGE_NEWS_FADE_MS,
} from '@/lib/news/homepage-rotation';

type Props = {
  news: LeadNewsResult;
};

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

function OverlayCopy({
  article,
  news,
}: {
  article: NewsFeedItem | null;
  news: LeadNewsResult;
}) {
  const metaClass =
    'font-mono text-[11px] uppercase tracking-[0.16em] text-white/85 md:text-[12px] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]';
  const headlineClass =
    'mt-1.5 max-w-3xl text-[1.4rem] font-semibold leading-[1.15] tracking-tight text-white line-clamp-3 md:mt-2 md:line-clamp-none md:text-3xl lg:text-[2.35rem] lg:leading-[1.12] [text-shadow:0_1px_2px_rgba(0,0,0,0.65),0_8px_28px_rgba(0,0,0,0.4)]';

  if (news.status === 'ok' && article) {
    return (
      <>
        <p className={metaClass}>
          <NewsAge iso={article.publishedAt} className="text-white/85" />
        </p>
        <h1 className={headlineClass}>{article.headline}</h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/80 md:text-[12px] [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
          {article.sourceDomain}
        </p>
      </>
    );
  }

  const title =
    news.status === 'gated'
      ? 'Latest story pending'
      : news.status === 'empty'
        ? 'No stories yet'
        : 'Latest news unavailable';

  return (
    <>
      <p className={metaClass}>Just in</p>
      <h1 className={`${headlineClass} max-w-2xl lg:text-3xl`}>{title}</h1>
      <p className="mt-2 max-w-md text-sm text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
        {news.message ??
          'News will appear here when public display is enabled and articles are available.'}
      </p>
    </>
  );
}

/**
 * Editorial NOW lead: rotating evergreen house imagery with live story overlay.
 * Story pool rotates client-side every HOMEPAGE_NEWS_ROTATION_MS — no network.
 */
export function HouseLeadHero({ news }: Props) {
  const images = HOUSE_IMAGE_SET;
  const articles =
    news.status === 'ok'
      ? news.articles.length > 0
        ? news.articles
        : news.article
          ? [news.article]
          : []
      : [];
  const articlesSig = homepageArticlesSignature(articles);
  const reducedMotion = usePrefersReducedMotion();

  const [imageIndex, setImageIndex] = useState(0);
  /** Bumps to restart the auto-rotate timer after a manual advance. */
  const [imageRotateEpoch, setImageRotateEpoch] = useState(0);
  const lastHoverAdvanceAt = useRef(0);

  const [storyOffset, setStoryOffset] = useState(0);
  const [storyOpacity, setStoryOpacity] = useState(1);
  const [tabHidden, setTabHidden] = useState(false);

  const canAutoRotateImages = !reducedMotion && images.length > 1;
  const canManualRotateImages = images.length > 1;
  const canRotateStories = shouldRotateHomepageNews(
    articles.length,
    HOMEPAGE_VISIBLE_NEWS_SLOTS,
  );

  // Reset story offset when the server-provided pool changes.
  useEffect(() => {
    setStoryOffset(0);
    setStoryOpacity(1);
  }, [articlesSig]);

  useEffect(() => {
    if (!canAutoRotateImages) return;
    const id = window.setInterval(() => {
      setImageIndex((current) => (current + 1) % images.length);
    }, HOUSE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [canAutoRotateImages, images.length, imageRotateEpoch]);

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    // Rotate while the tab is visible — do NOT pause on hero hover
    // (desktop cursors often rest over the large hero and would freeze the desk).
    if (!canRotateStories || tabHidden) return;
    const id = window.setInterval(() => {
      setStoryOffset((current) =>
        nextHomepageNewsOffset(
          current,
          articles.length,
          HOMEPAGE_VISIBLE_NEWS_SLOTS,
        ),
      );
    }, HOMEPAGE_NEWS_ROTATION_MS);
    return () => window.clearInterval(id);
  }, [canRotateStories, tabHidden, articles.length, articlesSig]);

  const visible = visibleHomepageArticles(
    articles,
    storyOffset,
    HOMEPAGE_VISIBLE_NEWS_SLOTS,
  );
  const targetArticle = visible[0] ?? null;
  const [displayedArticle, setDisplayedArticle] = useState<NewsFeedItem | null>(
    targetArticle,
  );
  const displayedId = displayedArticle?.providerArticleId ?? null;
  const targetId = targetArticle?.providerArticleId ?? null;

  useEffect(() => {
    if (targetId === displayedId) {
      setStoryOpacity(1);
      return;
    }
    if (reducedMotion || !displayedId) {
      setDisplayedArticle(targetArticle);
      setStoryOpacity(1);
      return;
    }
    setStoryOpacity(0);
    const id = window.setTimeout(() => {
      setDisplayedArticle(targetArticle);
      setStoryOpacity(1);
    }, HOMEPAGE_NEWS_FADE_MS / 2);
    return () => window.clearTimeout(id);
  }, [targetId, targetArticle, displayedId, reducedMotion]);

  function advanceImage() {
    if (!canManualRotateImages) return;
    setImageIndex((current) => (current + 1) % images.length);
    setImageRotateEpoch((n) => n + 1);
  }

  function advanceFromHover() {
    if (!canManualRotateImages) return;
    const now = Date.now();
    if (now - lastHoverAdvanceAt.current < HOUSE_HOVER_ADVANCE_MS) return;
    lastHoverAdvanceAt.current = now;
    advanceImage();
  }

  const article = news.status === 'ok' ? displayedArticle : null;
  const href = article?.url?.trim() ? article.url.trim() : null;
  const activeImageIndex = images.length === 0 ? 0 : imageIndex % images.length;
  const showActions = news.status === 'ok' && article != null;

  return (
    <div data-testid="house-lead-module" className="relative">
      <div
        className="relative aspect-[5/4] w-full overflow-hidden rounded-[var(--radius-editorial)] bg-[var(--scoop-orange)] md:aspect-[3/2]"
        data-testid="house-lead-hero"
      >
        {images.length > 0 ? (
          images.map((src, i) => {
            const active = i === activeImageIndex;
            return (
              <Image
                key={src}
                src={src}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 66vw"
                priority={i === 0}
                className="object-cover transition-opacity motion-reduce:transition-none"
                style={{
                  opacity: active ? 1 : 0,
                  transitionDuration: `${HOUSE_FADE_MS}ms`,
                }}
                aria-hidden={!active}
              />
            );
          })
        ) : (
          <div
            className="absolute inset-0 bg-[var(--scoop-orange)]"
            aria-hidden
            data-testid="house-lead-fallback"
          >
            <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-white/10" />
            <div className="absolute bottom-24 left-8 h-24 w-24 rounded-full bg-black/15" />
          </div>
        )}

        {/* Readability scrim — house photos are bright/busy; white copy needs denser shade */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[68%] bg-gradient-to-t from-black/92 via-black/55 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/50 to-transparent"
        />

        <div
          className="absolute inset-x-0 bottom-0 space-y-3 p-4 pt-10 md:space-y-5 md:p-7 md:pt-7 lg:p-8"
          data-testid="house-lead-story"
          data-story-id={article?.providerArticleId ?? ''}
          data-story-offset={String(storyOffset)}
          style={{
            opacity: storyOpacity,
            transitionProperty: reducedMotion ? 'none' : 'opacity',
            transitionDuration: `${HOMEPAGE_NEWS_FADE_MS}ms`,
          }}
        >
          <OverlayCopy article={article} news={news} />

          {showActions ? (
            <div
              className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center md:gap-3"
              data-testid="house-lead-actions"
            >
              <LaunchAsTokenLink providerArticleId={article.providerArticleId} />
              {href ? (
                <CtaLink href={href} external variant="secondary">
                  Read story ↗
                </CtaLink>
              ) : null}
            </div>
          ) : null}
        </div>

        {canManualRotateImages ? (
          <button
            type="button"
            data-testid="house-lead-rotate"
            aria-label="Next house image"
            className="absolute left-0 top-0 z-20 h-[30%] w-[30%] max-h-32 max-w-32 cursor-pointer rounded-br-[var(--radius-editorial)] bg-transparent transition-colors hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              advanceImage();
            }}
            onMouseEnter={advanceFromHover}
          />
        ) : null}
      </div>
    </div>
  );
}
