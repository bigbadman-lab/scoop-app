import type { ReactNode } from 'react';
import type { TokenDetail } from '@/lib/server/queries';
import {
  displayCompactUsdMarketValue,
  displayHolderCount,
  displayPriceChangeBps,
  displayUsd,
  displayVolume24hMetric,
  formatCompactAge,
  formatProgressPercent,
  truncateAddress,
} from '@/lib/format';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { TokenImage } from '@/components/ui/TokenImage';
import { TokenPriceChart } from '@/components/token/TokenPriceChart';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import {
  shouldShowBondingProgress,
  tokenMarketStatus,
} from '@/lib/token/market-status';
import { safeHttpsUrl } from '@/lib/token/safe-external-url';

type Props = {
  token: TokenDetail;
  quoteSymbol: string;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--divider)] py-1.5 last:border-b-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[12px] text-[var(--fg)]">{children}</dd>
    </div>
  );
}

/**
 * Compact token market shell — identity, stats strip, OHLC chart, market details.
 */
export function TokenMarketShell({ token, quoteSymbol }: Props) {
  const imageSrc = pickTokenImageSrc(token.displayImageUrl, token.imageUri);
  const priceUsd = displayUsd(token.priceUsdDisplay);
  const priceQuote =
    token.priceQuoteDisplay != null && token.priceQuoteDisplay.trim()
      ? `${token.priceQuoteDisplay} ${quoteSymbol}`
      : null;
  const change = displayPriceChangeBps(token.priceChange24hBps);
  const fdv = displayCompactUsdMarketValue(token.fdvUsdDisplay);
  const volume = displayVolume24hMetric({
    volume24hUsdDisplay: token.volume24hUsdDisplay,
    volume24hQuoteDisplay: token.volume24hQuoteDisplay,
    quoteSymbol,
  });
  const holdersRaw = displayHolderCount(token.holderCountRetail, token.holderCountAll);
  const holders = holdersRaw ? holdersRaw.replace(/ holders?$/, '') : null;
  const age = formatCompactAge(token.ageSeconds);
  const status = tokenMarketStatus(token);
  const showProgress = shouldShowBondingProgress(token);
  const changeTone =
    token.priceChange24hBps == null
      ? 'text-[var(--muted-2)]'
      : token.priceChange24hBps > 0
        ? 'text-[var(--scoop-live)]'
        : token.priceChange24hBps < 0
          ? 'text-[var(--scoop-orange)]'
          : 'text-[var(--muted)]';

  const aboutLinks = [
    { label: 'Website', href: safeHttpsUrl(token.website) },
    { label: 'X', href: safeHttpsUrl(token.twitter) },
    { label: 'Telegram', href: safeHttpsUrl(token.telegram) },
    { label: 'Discord', href: safeHttpsUrl(token.discord) },
    { label: 'Farcaster', href: safeHttpsUrl(token.farcaster) },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));
  const description = token.description?.trim() || null;
  const showAbout = Boolean(description || aboutLinks.length > 0);

  const metrics = [
    { label: 'FDV', value: fdv ?? '—' },
    { label: '24H Vol', value: volume ?? '—' },
    { label: 'Holders', value: holders ?? '—' },
    { label: 'Launched', value: age },
  ];

  return (
    <div
      data-testid="token-market-shell"
      data-token-address={token.tokenAddress}
      data-layout="compact"
    >
      {/* Compact identity + price header */}
      <header className="border-b border-[var(--divider)] pb-3">
        <div className="flex gap-3 sm:items-start sm:gap-4">
          <TokenImage
            src={imageSrc}
            alt={token.name}
            size={64}
            className="h-14 w-14 shrink-0 rounded-[var(--radius-lg)] sm:h-16 sm:w-16"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p
                  className="font-mono text-[12px] tracking-wide text-[var(--muted)]"
                  data-testid="token-pair"
                >
                  ${token.symbol} / {quoteSymbol}
                </p>
                <ContractCopy address={token.tokenAddress} className="min-h-0 py-0" />
              </div>
              <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-[var(--fg)] sm:text-xl">
                {token.name}
              </h1>
            </div>

            <div className="min-w-0 shrink-0 sm:text-right">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:justify-end">
                <p
                  className="tabular text-[1.5rem] font-semibold leading-none tracking-tight text-[var(--fg)] sm:text-[1.75rem]"
                  data-testid="token-price-primary"
                >
                  {priceUsd ?? priceQuote ?? '—'}
                </p>
                <p
                  className={`tabular font-mono text-[12px] tracking-wide ${changeTone}`}
                  data-testid="token-change-24h"
                  aria-label={
                    change == null ? '24 hour change unavailable' : `24 hour change ${change}`
                  }
                >
                  {change ?? '—'}
                </p>
              </div>
              {priceUsd && priceQuote ? (
                <p
                  className="mt-1 tabular font-mono text-[11px] tracking-wide text-[var(--muted)]"
                  data-testid="token-price-quote"
                >
                  {priceQuote}
                </p>
              ) : null}
              {!priceUsd && priceQuote ? (
                <p
                  className="mt-1 font-mono text-[10px] text-[var(--muted-2)]"
                  data-testid="token-usd-unavailable"
                >
                  USD unavailable
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {showAbout ? (
        <section
          className="mt-3 border-b border-[var(--divider)] pb-3"
          aria-labelledby="token-about-heading"
          data-testid="token-about"
        >
          <h2
            id="token-about-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          >
            About
          </h2>
          {description ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--fg)]">
              {description}
            </p>
          ) : null}
          {aboutLinks.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {aboutLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Compact stats strip */}
      <div
        className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--divider)] pb-2.5 font-mono text-[11px] tracking-wide text-[var(--muted)]"
        data-testid="token-metrics"
      >
        {metrics.map((m, i) => (
          <span key={m.label} className="inline-flex items-baseline gap-1.5">
            {i > 0 ? (
              <span className="mr-1 text-[var(--divider)]" aria-hidden>
                ·
              </span>
            ) : null}
            <span className="uppercase tracking-[0.12em] text-[var(--muted-2)]">{m.label}</span>
            <span className="tabular font-semibold text-[var(--fg)]">{m.value}</span>
          </span>
        ))}
      </div>
      {!fdv ? (
        <p className="sr-only" data-testid="token-fdv-unavailable">
          FDV unavailable
        </p>
      ) : (
        <p className="sr-only" data-testid="token-fdv-label">
          FDV
        </p>
      )}

      {/* Chart + market details — aligned block */}
      <div
        className="mt-4 grid gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5"
        data-testid="token-market-main"
      >
        <section
          className="min-w-0 lg:col-span-8"
          aria-labelledby="token-price-panel-heading"
          data-testid="token-price-panel"
        >
          <TokenPriceChart
            tokenAddress={token.tokenAddress}
            symbol={token.symbol}
            quoteSymbol={quoteSymbol}
            totalSupplyRaw={token.totalSupplyRaw}
            tokenDecimals={token.decimals}
            currentPriceUsdX18={token.priceUsdX18}
            currentPriceQuoteX18={token.priceQuoteX18}
          />
        </section>

        <section
          className="min-w-0 lg:col-span-4"
          aria-labelledby="token-market-details-heading"
          data-testid="token-market-details"
        >
          <h2
            id="token-market-details-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          >
            Market
          </h2>
          <dl className="mt-1 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-1">
            <DetailRow label="Pair">
              <span data-testid="token-detail-pair">
                ${token.symbol} / {quoteSymbol}
              </span>
            </DetailRow>
            <DetailRow label="Holders">
              <span>{holders ?? '—'}</span>
            </DetailRow>
            <DetailRow label="Launched">
              <span>{age}</span>
            </DetailRow>
            <DetailRow label="Status">
              <span data-testid="token-status">{status}</span>
            </DetailRow>
            {showProgress ? (
              <DetailRow label="Bonding">
                <span data-testid="token-bonding-progress">
                  {formatProgressPercent(token.launchProgressBps)}
                </span>
              </DetailRow>
            ) : null}
            <DetailRow label="Contract">
              <ContractCopy address={token.tokenAddress} className="min-h-0 py-0" />
            </DetailRow>
            <DetailRow label="Pool">
              <span className="font-mono text-[11px]" title={token.poolId}>
                {truncateAddress(token.poolId, 6, 4)}
              </span>
              <span className="sr-only" data-testid="token-pool-id">
                {token.poolId}
              </span>
            </DetailRow>
            <DetailRow label="Deployer">
              <ContractCopy address={token.deployerAddress} className="min-h-0 py-0" />
            </DetailRow>
            <DetailRow label="Creator">
              <ContractCopy address={token.creatorId} className="min-h-0 py-0" />
              <span className="sr-only" data-testid="token-creator-id">
                {token.creatorId}
              </span>
            </DetailRow>
          </dl>
        </section>
      </div>
    </div>
  );
}

export function TokenMarketUnavailable({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-xl)] border border-dashed border-[var(--divider)] px-6 py-12 text-center"
      data-testid="token-market-unavailable"
    >
      <h1 className="text-xl font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
      <p className="mt-3 text-[15px] text-[var(--muted)]">{message}</p>
    </div>
  );
}
