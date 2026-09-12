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
import { ContractCopy } from '@/components/ui/ContractCopy';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import { MARKETS_DESKTOP_ROW_GRID } from '@/lib/markets/constants';

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

  return (
    <li
      data-testid="market-row"
      data-token={market.tokenAddress}
      data-rank={rank}
      data-leader={isLeader ? 'true' : 'false'}
      data-leader-pulse={leaderPulse ? 'true' : 'false'}
      className={[
        'group relative',
        isLeader ? 'markets-leader-row' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-ambient={isLeader ? 'true' : undefined}
      data-pulse={leaderPulse ? 'true' : undefined}
    >
      {/* Overlay link keeps ContractCopy a sibling (valid HTML; no nested button-in-link). */}
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
          'pointer-events-none relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3.5 transition-colors',
          'group-hover:bg-[color-mix(in_srgb,var(--bg)_40%,transparent)]',
          MARKETS_DESKTOP_ROW_GRID,
        ].join(' ')}
      >
        <span
          className={[
            'flex items-center justify-center gap-0.5 pt-2 font-mono text-[12px] tabular md:pt-0',
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
            <span
              className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[12px] tracking-wide text-[var(--muted)]"
              data-testid="market-pair-age"
            >
              <span className="shrink-0">${market.symbol}</span>
              <span aria-hidden>/</span>
              <QuoteAssetBadge
                symbol={market.quoteSymbol}
                imageUrl={market.quoteImageUrl}
                className="align-middle"
              />
              <span aria-hidden>·</span>
              <span data-testid="market-age" className="shrink-0">
                {age}
              </span>
            </span>
            <span className="mt-0.5 block min-w-0">
              <ContractCopy
                address={market.tokenAddress}
                label="Copy token address"
                copiedLabel="Token address copied"
                className="pointer-events-auto min-h-9 max-w-full px-0 py-0 text-[11px] md:min-h-0"
              />
            </span>
          </span>
        </span>

        <span className="col-span-2 grid max-w-[17.5rem] grid-cols-3 gap-x-3 pl-[2.75rem] md:contents">
          <span className="min-w-0 md:contents">
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] md:hidden">
              Fdv
            </span>
            <LiveMetric
              value={fdv}
              testId="market-fdv"
              className="mt-0.5 block text-[13px] font-medium tracking-tight md:mt-0 md:text-right md:text-[15px]"
            />
          </span>
          <span className="min-w-0 md:contents">
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] md:hidden">
              Trades
            </span>
            <LiveMetric
              value={trades}
              testId="market-trades"
              className="mt-0.5 block text-[13px] font-medium tracking-tight md:mt-0 md:text-right md:text-[15px]"
            />
          </span>
          <span className="min-w-0 md:contents">
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] md:hidden">
              Holders
            </span>
            <LiveMetric
              value={holders}
              testId="market-holders"
              className="mt-0.5 block text-[13px] font-medium tracking-tight md:mt-0 md:text-right md:text-[15px]"
            />
          </span>
        </span>
      </div>
    </li>
  );
}
