'use client';

import { classifyNewsFreshness, isNewsFresh } from '@/lib/news/freshness';

type Props = {
  publishedAt: string;
  /**
   * Dedicated lead-slot marker.
   * - `latest` — active lead is the newest pool story
   * - `live_story` — rotating lead that is not the absolute newest
   * - omit — normal feed row (NEW / JUST IN from age)
   */
  leadMarker?: 'latest' | 'live_story';
  /** @deprecated Prefer leadMarker for the rotating lead slot. */
  isLead?: boolean;
  now?: number;
};

/**
 * Compact green desk badge for newest / lead stories.
 * Decorative for sighted hierarchy; age text remains the accessible timestamp.
 */
export function NewsFreshnessBadge({
  publishedAt,
  leadMarker,
  isLead = false,
  now,
}: Props) {
  const freshness = classifyNewsFreshness(publishedAt, now ?? Date.now());
  const marker = leadMarker ?? (isLead ? 'latest' : undefined);

  if (marker === 'latest') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--scoop-live)]"
        data-testid="news-freshness-badge"
        data-freshness="latest"
        aria-hidden
      >
        <span
          className="news-fresh-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--scoop-live)]"
          data-pulse="true"
          aria-hidden
        />
        Latest
      </span>
    );
  }

  if (marker === 'live_story') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--scoop-live)]"
        data-testid="news-freshness-badge"
        data-freshness="live_story"
        aria-hidden
      >
        <span
          className="news-fresh-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--scoop-live)]"
          aria-hidden
        />
        Live story
      </span>
    );
  }

  if (!isNewsFresh(freshness)) return null;

  const label = freshness === 'just_in' ? 'Just in' : 'New';

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--scoop-live)]"
      data-testid="news-freshness-badge"
      data-freshness={freshness}
      aria-hidden
    >
      <span
        className="news-fresh-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--scoop-live)]"
        data-pulse={freshness === 'just_in' ? 'true' : undefined}
        aria-hidden
      />
      {label}
    </span>
  );
}
