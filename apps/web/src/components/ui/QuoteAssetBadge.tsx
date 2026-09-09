'use client';

import { useState } from 'react';

type Props = {
  symbol: string;
  imageUrl?: string | null;
  className?: string;
};

/**
 * Compact quote-asset identity for discovery cards.
 * Uses catalogue imageUrl when present; otherwise a deterministic ticker monogram.
 * Never fetches third-party logos ad hoc.
 */
export function QuoteAssetBadge({ symbol, imageUrl = null, className = '' }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const label = symbol.trim() || '?';
  const monogram = label.slice(0, 3).toUpperCase();
  const showImage = Boolean(imageUrl && !imgFailed);

  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--divider)]',
        'bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-1.5 py-0.5',
        'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg)]',
        'shadow-[0_1px_2px_rgba(10,10,10,0.06)] backdrop-blur-[2px]',
        className,
      ].join(' ')}
      data-testid="quote-asset-badge"
      title={`Quoted in ${label}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalogue CDN/storage URLs
        <img
          src={imageUrl!}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          aria-hidden
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--scoop-orange)] text-[8px] font-semibold leading-none text-[var(--scoop-orange-contrast)]"
          data-testid="quote-asset-monogram"
        >
          {monogram.slice(0, 1)}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
