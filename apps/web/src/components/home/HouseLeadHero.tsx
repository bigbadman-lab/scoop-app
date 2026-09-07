'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { HOUSE_IMAGE_SET } from '@/lib/brand';
import { NewsAge } from '@/components/news/NewsAge';
import type { LeadNewsResult } from '@/lib/news/load-home';
import type { NewsFeedItem } from '@scoop/news';

export const HOUSE_ROTATE_MS = 10_000;
export const HOUSE_FADE_MS = 500;

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
  if (news.status === 'ok' && article) {
    return (
      <>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/75 md:text-[12px]">
          <NewsAge iso={article.publishedAt} className="text-white/75" />
        </p>
        <h1 className="mt-2 max-w-3xl text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-white md:text-3xl lg:text-[2.35rem] lg:leading-[1.12]">
          {article.headline}
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/70 md:text-[12px]">
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
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/75 md:text-[12px]">
        Just in
      </p>
      <h1 className="mt-2 max-w-2xl text-[1.65rem] font-semibold leading-[1.15] tracking-tight text-white md:text-3xl">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-sm text-white/70">
        {news.message ??
          'News will appear here when public display is enabled and articles are available.'}
      </p>
    </>
  );
}

/**
 * Editorial NOW lead: rotating evergreen house imagery with live story overlay.
 * Image rotation is independent of the latest article.
 */
export function HouseLeadHero({ news }: Props) {
  const images = HOUSE_IMAGE_SET;
  const article = news.article;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const canRotate = !reducedMotion && images.length > 1;

  useEffect(() => {
    if (!canRotate) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, HOUSE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [canRotate, images.length]);

  const href = article?.url?.trim() ? article.url.trim() : null;
  const activeIndex = images.length === 0 ? 0 : index % images.length;

  const frame = (
    <div
      className="relative w-full overflow-hidden rounded-[var(--radius-editorial)] bg-[var(--scoop-orange)]"
      style={{ aspectRatio: '1.5 / 1' }}
      data-testid="house-lead-hero"
    >
      {images.length > 0 ? (
        images.map((src, i) => {
          const active = i === activeIndex;
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

      {/* Readability gradient — lower ~40% */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/75 via-black/35 to-transparent"
      />

      <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 lg:p-8">
        <OverlayCopy article={article} news={news} />
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block focus-visible:outline-offset-4"
        aria-label={
          article
            ? `${article.headline} — ${article.sourceDomain}`
            : 'Read latest story'
        }
      >
        {frame}
      </a>
    );
  }

  return frame;
}
