'use client';

import Link from 'next/link';
import type { MarketsBoardItem } from '@/lib/markets/types';
import { displayCompactUsdMarketValue } from '@/lib/format';
import { TokenImage } from '@/components/ui/TokenImage';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';

type Props = {
  rank: number;
  market: MarketsBoardItem;
};

export function MarketRow({ rank, market }: Props) {
  const href = `/token/${market.tokenAddress}`;
  const fdv = displayCompactUsdMarketValue(market.fdvUsdDisplay);
  const imageSrc = pickTokenImageSrc(market.displayImageUrl, market.imageUri);

  return (
    <li data-testid="market-row" data-token={market.tokenAddress}>
      <Link
        href={href}
        className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 py-3.5 transition-colors hover:bg-[var(--bg)] focus-visible:outline-offset-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_7.5rem] sm:gap-4"
      >
        <span
          className="tabular text-center font-mono text-[12px] text-[var(--muted)]"
          aria-label={`Rank ${rank}`}
        >
          {rank}
        </span>

        <span className="flex min-w-0 items-center gap-3">
          <TokenImage
            src={imageSrc}
            alt=""
            size={40}
            className="h-10 w-10 shrink-0 rounded-[var(--radius-md)]"
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold tracking-tight">
              {market.name}
            </span>
            <span className="mt-0.5 block truncate font-mono text-[12px] tracking-wide text-[var(--muted)]">
              ${market.symbol} / {market.quoteSymbol}
            </span>
          </span>
        </span>

        <span
          className="tabular text-right text-[14px] font-medium tracking-tight sm:text-[15px]"
          data-testid="market-fdv"
        >
          {fdv ?? '—'}
        </span>
      </Link>
    </li>
  );
}
