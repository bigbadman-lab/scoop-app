'use client';

import { classifyNewsFreshness, isNewsFresh } from '@/lib/news/freshness';

type Props = {
  publishedAt: string;
  /** Top-of-feed story — always marked LATEST. */
  isLead?: boolean;
  now?: number;
};

/**
 * Compact green desk badge for newest stories.
 * Decorative for sighted hierarchy; age text remains the accessible timestamp.
 */
export function NewsFreshnessBadge({ publishedAt, isLead = false, now }: Props) {
  const freshness = classifyNewsFreshness(publishedAt, now ?? Date.now());
  const showLatest = isLead;
  const showNew = !isLead && isNewsFresh(freshness);

  if (!showLatest && !showNew) return null;

  const label = showLatest ? 'Latest' : freshness === 'just_in' ? 'Just in' : 'New';

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--scoop-live)]"
      data-testid="news-freshness-badge"
      data-freshness={showLatest ? 'latest' : freshness}
      aria-hidden
    >
      <span
        className="news-fresh-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--scoop-live)]"
        data-pulse={showLatest || freshness === 'just_in' ? 'true' : undefined}
        aria-hidden
      />
      {label}
    </span>
  );
}
