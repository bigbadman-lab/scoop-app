'use client';

import Link from 'next/link';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import {
  displayFdv,
  displayHolderCount,
  displayPriceChangeBps,
  displayTokenPrice,
  displayUsd,
  displayVolume24h,
  formatCompactAge,
} from '@/lib/format';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { TokenImage } from '@/components/ui/TokenImage';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';

type Props = {
  token: TokenDiscoveryItem;
  quoteSymbol: string;
};

export function TokenDiscoveryItemCard({ token, quoteSymbol }: Props) {
  const href = `/token/${token.tokenAddress}`;
  const price = displayTokenPrice({
    priceUsdDisplay: token.priceUsdDisplay,
    priceQuoteDisplay: token.priceQuoteDisplay,
    quoteSymbol,
  });
  const change = displayPriceChangeBps(token.priceChange24hBps);
  const fdv = displayUsd(token.fdvUsdDisplay);
  const volume = displayVolume24h(token.volume24hQuoteDisplay, quoteSymbol);
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
        className="block focus-visible:outline-offset-4"
        data-testid="token-discovery-item"
      >
        <TokenImage
          src={pickTokenImageSrc(token.displayImageUrl, token.imageUri)}
          alt={token.name}
          className="w-full rounded-[var(--radius-xl)]"
          size={320}
        />
        <div className="mt-3 space-y-1.5">
          <p className="font-mono text-[12px] tracking-wide text-[var(--muted)]">
            ${token.symbol} / {quoteSymbol}
          </p>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--fg)]">
            {token.name}
          </h3>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
            <p className="tabular text-[15px] font-semibold tracking-tight">
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

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {fdv ? (
              <p className="tabular text-[13px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--fg)]">{fdv}</span>{' '}
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  FDV
                </span>
              </p>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                FDV unavailable
              </p>
            )}
            {volume ? (
              <p className="tabular font-mono text-[11px] tracking-wide text-[var(--muted)]">
                {volume}
              </p>
            ) : null}
          </div>

          <p className="font-mono text-[11px] tracking-wide text-[var(--muted-2)]">
            {[holders, age].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </Link>
      <div className="mt-2">
        <ContractCopy address={token.tokenAddress} />
      </div>
    </article>
  );
}

/** Exported for tests — confirms FDV is never mislabeled as market cap. */
export function tokenCardFdvLabel(fdvUsdDisplay: string | null | undefined): string {
  return displayFdv(fdvUsdDisplay) ? 'FDV' : 'FDV unavailable';
}
