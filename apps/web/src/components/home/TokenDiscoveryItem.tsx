'use client';

import Link from 'next/link';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import {
  displayCompactUsdMarketValue,
  displayFdv,
  displayHolderCount,
  displayPriceChangeBps,
  displayTokenPrice,
  displayVolume24hMetric,
  formatCompactAge,
} from '@/lib/format';
import { TokenImage } from '@/components/ui/TokenImage';
import { QuoteAssetBadge } from '@/components/ui/QuoteAssetBadge';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';

type Props = {
  token: TokenDiscoveryItem;
  quoteSymbol: string;
  /** Catalogue image for the quote asset; null → monogram fallback. */
  quoteImageUrl?: string | null;
};

export function TokenDiscoveryItemCard({
  token,
  quoteSymbol,
  quoteImageUrl = null,
}: Props) {
  const href = `/token/${token.tokenAddress}`;
  const price = displayTokenPrice({
    priceUsdDisplay: token.priceUsdDisplay,
    priceQuoteDisplay: token.priceQuoteDisplay,
    quoteSymbol,
  });
  const change = displayPriceChangeBps(token.priceChange24hBps);
  const fdv = displayCompactUsdMarketValue(token.fdvUsdDisplay);
  const volume = displayVolume24hMetric({
    volume24hUsdDisplay: token.volume24hUsdDisplay,
    volume24hQuoteDisplay: token.volume24hQuoteDisplay,
    quoteSymbol,
  });
  const holders = displayHolderCount(token.holderCountRetail, token.holderCountAll);
  const age = formatCompactAge(token.ageSeconds);

  const changeTone =
    token.priceChange24hBps == null
      ? 'text-[var(--muted-2)]'
      : token.priceChange24hBps > 0
        ? 'text-[var(--scoop-live)]'
        : token.priceChange24hBps < 0
          ? 'text-[var(--scoop-orange)]'
          : 'text-[var(--muted)]';

  return (
    <article className="group min-w-0" data-token-address={token.tokenAddress}>
      <Link
        href={href}
        className={[
          'block overflow-hidden rounded-[var(--radius-xl)] border border-[var(--divider)]',
          'bg-[var(--bg-elevated)] transition-colors',
          'hover:border-[color-mix(in_srgb,var(--fg)_22%,var(--divider))]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        ].join(' ')}
        data-testid="token-discovery-item"
      >
        <div className="relative aspect-square overflow-hidden bg-[var(--bg)]">
          <TokenImage
            src={pickTokenImageSrc(token.displayImageUrl, token.imageUri)}
            alt={token.name}
            className="h-full w-full rounded-none"
            size={320}
          />
          <div className="pointer-events-none absolute left-2 top-2 z-10">
            <QuoteAssetBadge symbol={quoteSymbol} imageUrl={quoteImageUrl} />
          </div>
        </div>

        <div className="space-y-2 px-3 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--fg)]">
              {token.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[12px] tracking-wide text-[var(--muted)]">
              ${token.symbol}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <p className="tabular text-[15px] font-semibold tracking-tight text-[var(--fg)]">
              {price ?? '—'}
            </p>
            <p
              className={`tabular font-mono text-[12px] tracking-wide ${changeTone}`}
              aria-label={
                change == null ? '24 hour change unavailable' : `24 hour change ${change}`
              }
            >
              {change ?? '—'}
            </p>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            {fdv ? (
              <p className="tabular text-[13px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--fg)]">{fdv}</span>{' '}
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  FDV
                </span>
              </p>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                FDV unavailable
              </p>
            )}
            {volume ? (
              <p className="tabular text-[13px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--fg)]">{volume}</span>{' '}
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  VOL
                </span>
              </p>
            ) : null}
          </div>

          <p className="font-mono text-[11px] tracking-wide text-[var(--muted-2)]">
            {[holders, age].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </Link>
    </article>
  );
}

/** Exported for tests — confirms FDV is never mislabeled as market cap. */
export function tokenCardFdvLabel(fdvUsdDisplay: string | null | undefined): string {
  return displayCompactUsdMarketValue(fdvUsdDisplay) || displayFdv(fdvUsdDisplay)
    ? 'FDV'
    : 'FDV unavailable';
}
