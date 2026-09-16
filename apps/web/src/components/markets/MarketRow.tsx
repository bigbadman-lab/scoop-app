'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { MarketsBoardItem } from '@/lib/markets/types';
import {
  displayCompactUsdMarketValue,
  formatLaunchAge,
  resolveHolderCount,
} from '@/lib/format';
import { TokenImage } from '@/components/ui/TokenImage';
import { QuoteAssetBadge } from '@/components/ui/QuoteAssetBadge';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import {
  MARKETS_DESKTOP_ROW_GRID,
  MARKETS_MOBILE_ROW_GRID,
} from '@/lib/markets/constants';

type Props = {
  /** Canonical rank in the active discovery view (not search position). */
  rank: number;
  market: MarketsBoardItem;
  /** Client clock for launch-age labels (tests inject). */
  nowMs?: number;
  /** One-shot leadership-change pulse for this row. */
  leaderPulse?: boolean;
};

function formatTradeCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(Math.max(0, Math.floor(n)));
}

function formatHolders(retail: number | null, all: number | null): string {
  const n = resolveHolderCount(retail, all);
  return n == null ? '—' : String(n);
}

function LiveMetric({
  value,
  testId,
  className,
}: {
  value: string;
  testId: string;
  className?: string;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 320);
    return () => window.clearTimeout(id);
  }, [value]);

  return (
    <span
      data-testid={testId}
      className={[
        'tabular transition-[opacity,background-color] duration-300',
        flash
          ? 'bg-[color-mix(in_srgb,var(--scoop-orange)_10%,transparent)] opacity-90'
          : 'bg-transparent opacity-100',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {value}
    </span>
  );
}

export function MarketRow({
  rank,
  market,
  nowMs,
  leaderPulse = false,
}: Props) {
  const href = `/token/${market.tokenAddress}`;
  const fdv = displayCompactUsdMarketValue(market.fdvUsdDisplay) ?? '—';
  const trades = formatTradeCount(market.tradeCountAllTime);
  const holders = formatHolders(market.holderCountRetail, market.holderCountAll);
  const age = formatLaunchAge(market.launchedAt, nowMs);
  const imageSrc = pickTokenImageSrc(market.displayImageUrl, market.imageUri);
  const isLeader = rank === 1;
  const loreTitle = market.loreTitle?.trim() || null;

  return (
    <li
      data-testid="market-row"
      data-token={market.tokenAddress}
      data-rank={rank}
      data-leader={isLeader ? 'true' : 'false'}
      data-leader-pulse={leaderPulse ? 'true' : 'false'}
      data-has-lore={loreTitle ? 'true' : 'false'}
      className={[
        'group relative',
        isLeader ? 'markets-leader-row' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-ambient={isLeader ? 'true' : undefined}
      data-pulse={leaderPulse ? 'true' : undefined}
    >
      <Link
        href={href}
        className="absolute inset-0 z-0 rounded-[var(--radius-sm)] focus-visible:outline-offset-4"
        aria-label={
          isLeader
            ? `Open ${market.name} market, rank ${rank}, market leader`
            : `Open ${market.name} market, rank ${rank}`
        }
        data-testid="market-row-link"
      />
      <div
        className={[
          'pointer-events-none relative z-10 grid overflow-hidden py-2',
          MARKETS_MOBILE_ROW_GRID,
          MARKETS_DESKTOP_ROW_GRID,
          'group-hover:bg-[color-mix(in_srgb,var(--bg)_40%,transparent)]',
        ].join(' ')}
      >
        <span
          className={[
            'flex items-center justify-center gap-0.5 font-mono text-[11px] tabular md:text-[12px]',
            isLeader ? 'text-[var(--scoop-orange)]' : 'text-[var(--muted)]',
          ].join(' ')}
          aria-hidden
          data-testid="market-rank"
        >
          {isLeader ? (
            <span data-testid="market-leader-flame">🔥</span>
          ) : null}
          <span>{rank}</span>
        </span>

        {/* Mobile image column */}
        <TokenImage
          src={imageSrc}
          alt=""
          size={28}
          className="h-7 w-7 shrink-0 rounded-[var(--radius-md)] md:hidden"
        />

        <span className="flex min-w-0 items-center gap-2.5 overflow-hidden md:gap-3">
          <TokenImage
            src={imageSrc}
            alt=""
            size={32}
            className="hidden h-8 w-8 shrink-0 rounded-[var(--radius-md)] md:block"
          />
          <span className="min-w-0 flex-1 overflow-hidden">
            {/* Mobile: single non-wrapping identity line */}
            <span
              className="flex min-w-0 items-center gap-x-1.5 overflow-hidden whitespace-nowrap md:hidden"
              data-testid="market-identity-mobile"
            >
              <span className="shrink-0 font-mono text-[12px] font-semibold tracking-tight">
                ${market.symbol}
              </span>
              <span className="shrink-0 text-[var(--muted)]" aria-hidden>
                /
              </span>
              <QuoteAssetBadge
                symbol={market.quoteSymbol}
                imageUrl={market.quoteImageUrl}
                className="shrink-0 align-middle !py-0 !text-[10px]"
              />
              <span className="min-w-0 truncate text-[12px] text-[var(--muted)]">
                {market.name}
              </span>
              {loreTitle ? (
                <span
                  className="hidden min-w-0 truncate text-[11px] text-[var(--muted-2)] min-[390px]:inline"
                  data-testid="market-lore"
                >
                  · {loreTitle}
                </span>
              ) : null}
            </span>

            {/* Desktop: primary ticker/name + optional lore secondary line */}
            <span className="hidden min-w-0 md:block" data-testid="market-identity-desktop">
              <span className="flex min-w-0 items-center gap-x-1.5 overflow-hidden whitespace-nowrap">
                <span className="shrink-0 font-mono text-[13px] font-semibold tracking-tight">
                  ${market.symbol}
                </span>
                <span className="shrink-0 text-[var(--muted)]" aria-hidden>
                  /
                </span>
                <QuoteAssetBadge
                  symbol={market.quoteSymbol}
                  imageUrl={market.quoteImageUrl}
                  className="shrink-0 align-middle"
                />
                <span className="min-w-0 truncate text-[13px] font-medium tracking-tight text-[var(--fg)]">
                  {market.name}
                </span>
                <span
                  data-testid="market-age"
                  className="shrink-0 font-mono text-[11px] text-[var(--muted-2)]"
                >
                  · {age}
                </span>
              </span>
              {loreTitle ? (
                <span
                  className="mt-0.5 block min-w-0 truncate text-[12px] leading-tight text-[var(--muted)]"
                  data-testid="market-lore"
                >
                  {loreTitle}
                </span>
              ) : null}
            </span>
          </span>
        </span>

        <LiveMetric
          value={fdv}
          testId="market-fdv"
          className="block truncate text-right text-[12px] font-medium tracking-tight tabular md:text-[13px]"
        />
        <LiveMetric
          value={trades}
          testId="market-trades"
          className="block truncate text-right text-[12px] font-medium tracking-tight tabular md:text-[13px]"
        />
        <LiveMetric
          value={holders}
          testId="market-holders"
          className="block truncate text-right text-[12px] font-medium tracking-tight tabular md:text-[13px]"
        />
      </div>
    </li>
  );
}
