'use client';

import type { ReactNode } from 'react';
import type { TokenDetail } from '@/lib/server/queries';
import {
  displayCompactUsdMarketValue,
  displayHolderCount,
  displayPriceChangeBps,
  displayUsd,
  displayVolume24hMetric,
  formatCompactAge,
  formatFeeAssetDistributionLines,
  formatFeeSplitPercent,
  formatPoolTradingFeePercent,
  formatProgressPercent,
  truncateAddress,
} from '@/lib/format';
import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { CopyMarketLinkButton } from '@/components/ui/CopyMarketLinkButton';
import { QuoteAssetBadge } from '@/components/ui/QuoteAssetBadge';
import {
  NetworkBadge,
  networkBadgeIdForToken,
} from '@/components/ui/NetworkBadge';
import { TokenImage } from '@/components/ui/TokenImage';
import { TokenPriceChart } from '@/components/token/TokenPriceChart';
import { TokenBuySell } from '@/components/token/TokenBuySell';
import { TokenSolanaCreatorRewards } from '@/components/token/TokenSolanaCreatorRewards';
import { TokenRecentTrades } from '@/components/token/TokenRecentTrades';
import {
  TokenMarketLiveProvider,
  useTokenMarketLive,
} from '@/components/token/TokenMarketLiveProvider';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import { shouldShowBondingProgress } from '@/lib/token/market-status';
import { safeHttpsUrl } from '@/lib/token/safe-external-url';
import type { TokenNewsLore } from '@/lib/token/load-token-page';
import {
  pumpFunCoinUrl,
  solanaExplorerAddressUrl,
  solanaExplorerTxUrl,
} from '@/lib/solana/explorer';

/** FDV in SOL for Pump pages — never invent zero when price missing. */
function formatPumpFdvSol(token: TokenDetail): string | null {
  if (!token.priceQuoteX18) return null;
  try {
    const price = BigInt(token.priceQuoteX18);
    const supply = BigInt(token.totalSupplyRaw);
    if (supply <= BigInt(0)) return null;
    const scale = BigInt(10) ** BigInt(token.decimals);
    const fdvX18 = (price * supply) / scale;
    const x18 = BigInt(10) ** BigInt(18);
    const whole = fdvX18 / x18;
    const frac = fdvX18 % x18;
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6);
    const body = fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
    return `${body} SOL`;
  } catch {
    return null;
  }
}

type Props = {
  token: TokenDetail;
  quoteSymbol: string;
  quoteImageUrl?: string | null;
  lore?: TokenNewsLore | null;
};

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--divider)] py-1 last:border-b-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[12px] text-[var(--fg)]">{children}</dd>
    </div>
  );
}

/** Untitled group with a subtle top rule between logical MARKET sections. */
function MarketGroup({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-[var(--divider)] pt-0.5 first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}

/**
 * Client market body — reads one live snapshot for header, metrics, PRICE, trades, MARKET.
 */
function TokenMarketLiveBody({
  quoteSymbol,
  quoteImageUrl = null,
  lore = null,
}: {
  quoteSymbol: string;
  quoteImageUrl?: string | null;
  lore?: TokenNewsLore | null;
}) {
  const { token, refreshNow } = useTokenMarketLive();
  const loreHref = lore ? safeHttpsUrl(lore.url) : null;

  const imageSrc = pickTokenImageSrc(token.displayImageUrl, token.imageUri);
  const priceUsd = displayUsd(token.priceUsdDisplay);
  const priceQuote =
    token.priceQuoteDisplay != null && token.priceQuoteDisplay.trim()
      ? `${token.priceQuoteDisplay} ${quoteSymbol}`
      : null;
  const headlinePrice = priceUsd ?? priceQuote ?? '—';
  const change = displayPriceChangeBps(token.priceChange24hBps);
  const isPons = token.marketSource === 'pons_v2';
  const isPump = token.marketSource === 'pump';
  const fdvUsd = displayCompactUsdMarketValue(token.fdvUsdDisplay);
  const fdvPumpSol = isPump ? formatPumpFdvSol(token) : null;
  // Prefer canonical USD FDV when SOL→USD is available; keep SOL as fallback.
  const fdv = isPump ? fdvUsd ?? fdvPumpSol : fdvUsd;
  const volume = displayVolume24hMetric({
    volume24hUsdDisplay: token.volume24hUsdDisplay,
    volume24hQuoteDisplay: token.volume24hQuoteDisplay,
    quoteSymbol,
  });
  const holdersRaw = displayHolderCount(token.holderCountRetail, token.holderCountAll);
  const holders = holdersRaw
    ? holdersRaw.replace(/ holders?$/, '')
    : null;
  const age = formatCompactAge(token.ageSeconds);
  const showProgress = !isPump && shouldShowBondingProgress(token);
  const changeTone =
    token.priceChange24hBps == null
      ? 'text-[var(--muted-2)]'
      : token.priceChange24hBps > 0
        ? 'text-[var(--scoop-live)]'
        : token.priceChange24hBps < 0
          ? 'text-[var(--scoop-green)]'
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
    { label: 'Price', value: headlinePrice, testId: 'token-metric-price' },
    { label: 'FDV', value: fdv ?? '—', testId: 'token-metric-fdv' },
    { label: '24H Volume', value: volume ?? '—', testId: 'token-metric-volume' },
    { label: 'Holders', value: holders ?? '—', testId: 'token-metric-holders' },
  ];

  const tradingFee = formatPoolTradingFeePercent(token.poolFee);
  const creatorShare = formatFeeSplitPercent(PROTOCOL_FEE_SPLIT.creatorRewardsBps);
  const creatorEarningsLines = formatFeeAssetDistributionLines(
    token.creatorFeeDistributions,
  );
  // Scoop-only fee/buyback UI — never show Scoop protocol fee semantics on Pons/Pump.
  const showScoopFeePanel = !isPons && !isPump;
  const buybackAllocationLines = formatFeeAssetDistributionLines(
    token.buybackFeeDistributions,
  );
  const pumpUrl = isPump ? pumpFunCoinUrl(token.tokenAddress) : null;
  const mintExplorerUrl = isPump
    ? solanaExplorerAddressUrl(token.tokenAddress)
    : null;
  const launchExplorerUrl =
    isPump && token.launchTxHash
      ? solanaExplorerTxUrl(token.launchTxHash)
      : null;

  return (
    <div
      data-testid="token-market-shell"
      data-token-address={token.tokenAddress}
      data-layout="v2"
      data-live="true"
      className="pb-2"
    >
      <header className="pb-1.5">
        <div className="flex gap-2.5 sm:items-start sm:gap-3.5">
          <TokenImage
            src={imageSrc}
            alt={token.name}
            size={56}
            className="h-12 w-12 shrink-0 rounded-[var(--radius-lg)] sm:h-14 sm:w-14"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-6 lg:gap-8">
            <div className="min-w-0">
              <div className="flex items-start gap-2">
                <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-[var(--fg)] sm:text-xl">
                  {token.name}
                </h1>
                <CopyMarketLinkButton />
              </div>
              <div
                className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1"
                data-testid="token-pair"
              >
                <span className="font-mono text-[12px] tracking-wide text-[var(--muted)]">
                  ${token.symbol}
                </span>
                <span className="text-[var(--muted-2)]" aria-hidden>
                  ·
                </span>
                <QuoteAssetBadge
                  symbol={quoteSymbol}
                  imageUrl={quoteImageUrl}
                  className="rounded-[var(--radius-sm)] px-1 py-0.5 shadow-none"
                />
              </div>
              {/* Desktop: contract under pair. Mobile: demoted below price. */}
              <div className="mt-1 hidden sm:block">
                <ContractCopy
                  address={token.tokenAddress}
                  className="min-h-0 py-0"
                  label={
                    isPump
                      ? `Copy mint ${token.tokenAddress}`
                      : `Copy contract ${token.tokenAddress}`
                  }
                />
              </div>
            </div>

            <div className="min-w-0 shrink-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p
                  className="tabular text-[1.5rem] font-semibold leading-none tracking-tight text-[var(--fg)] sm:text-[1.75rem]"
                  data-testid="token-price-primary"
                >
                  {headlinePrice}
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
                  className="mt-0.5 tabular font-mono text-[11px] tracking-wide text-[var(--muted)]"
                  data-testid="token-price-quote"
                >
                  {priceQuote}
                </p>
              ) : null}
              {!priceUsd && priceQuote ? (
                <p
                  className="mt-0.5 font-mono text-[10px] text-[var(--muted-2)]"
                  data-testid="token-usd-unavailable"
                >
                  USD unavailable
                </p>
              ) : null}
              <div className="mt-1 sm:hidden">
                <ContractCopy
                  address={token.tokenAddress}
                  className="min-h-0 py-0"
                  label={
                    isPump
                      ? `Copy mint ${token.tokenAddress}`
                      : `Copy contract ${token.tokenAddress}`
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {lore && loreHref ? (
        <section
          className="mt-1.5 border-t border-[var(--divider)] pt-1.5"
          aria-labelledby="token-lore-heading"
          data-testid="token-lore"
        >
          <h2
            id="token-lore-heading"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          >
            Lore
          </h2>
          <p
            className="mt-0.5 max-w-2xl text-[13px] leading-snug text-[var(--fg)]"
            data-testid="token-lore-headline"
          >
            {lore.title}
          </p>
          <a
            href={loreHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:text-[var(--fg)] hover:underline"
            data-testid="token-lore-link"
          >
            {lore.sourceDomain?.trim() || 'Original article'}
          </a>
        </section>
      ) : null}

      {showAbout ? (
        <section
          className="mt-1.5 border-t border-[var(--divider)] pt-1.5"
          aria-labelledby="token-about-heading"
          data-testid="token-about"
        >
          <h2
            id="token-about-heading"
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          >
            About
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-2xl text-[13px] leading-snug text-[var(--fg)]">
              {description}
            </p>
          ) : null}
          {aboutLinks.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
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

      <div
        className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-1.5 border-y border-[var(--divider)] py-2 sm:gap-x-6 lg:gap-x-8"
        data-testid="token-metrics"
      >
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0 shrink-0" data-testid={m.testId}>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              {m.label}
            </p>
            <p className="mt-0.5 tabular text-[15px] font-semibold tracking-tight text-[var(--fg)] sm:text-[16px]">
              {m.value}
            </p>
          </div>
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

      <div
        className="mt-2 grid gap-3 lg:grid-cols-12 lg:items-start lg:gap-x-5"
        data-testid="token-market-main"
      >
        <div
          className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-3"
          data-testid="token-market-primary"
        >
          <section
            className="order-1 min-w-0 lg:order-none"
            aria-labelledby="token-price-panel-heading"
            data-testid="token-price-panel"
            data-region="token-market-primary"
          >
            {isPump ? (
              <div data-testid="token-price-panel-pump">
                <TokenPriceChart
                  tokenAddress={token.tokenAddress}
                  symbol={token.symbol}
                  quoteSymbol={quoteSymbol}
                  totalSupplyRaw={token.totalSupplyRaw}
                  tokenDecimals={token.decimals}
                  currentPriceUsdX18={null}
                  currentPriceQuoteX18={token.priceQuoteX18}
                />
                {!token.priceQuoteX18 ? (
                  <p
                    className="mt-2 font-mono text-[11px] text-[var(--muted)]"
                    data-testid="token-pump-waiting-trades"
                    role="status"
                  >
                    Waiting for trades
                    {pumpUrl ? (
                      <>
                        {' · '}
                        <a
                          href={pumpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--scoop-green)] underline-offset-4 hover:underline"
                        >
                          View on Pump.fun
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
            ) : (
              <TokenPriceChart
                tokenAddress={token.tokenAddress}
                symbol={token.symbol}
                quoteSymbol={quoteSymbol}
                totalSupplyRaw={token.totalSupplyRaw}
                tokenDecimals={token.decimals}
                currentPriceUsdX18={token.priceUsdX18}
                currentPriceQuoteX18={token.priceQuoteX18}
              />
            )}
          </section>

          <div className="order-3 min-w-0 lg:order-none" data-testid="token-market-trades">
            <TokenRecentTrades
              tokenAddress={token.tokenAddress}
              quoteSymbol={quoteSymbol}
              marketSource={token.marketSource}
            />
          </div>
        </div>

        <aside
          className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-3"
          data-testid="token-market-side"
        >
          <div className="order-2 min-w-0 space-y-3 lg:order-none">
            <TokenBuySell
              tokenAddress={token.tokenAddress}
              symbol={token.symbol}
              tokenDecimals={token.decimals}
              quoteAsset={token.quoteAsset}
              quoteSymbol={quoteSymbol}
              marketSource={token.marketSource}
              marketPhase={token.marketPhase}
              currency0={token.currency0}
              currency1={token.currency1}
              poolFee={token.poolFee}
              tickSpacing={token.tickSpacing}
              hooks={token.hooks}
              onTradeConfirmed={refreshNow}
            />
            {isPump ? (
              <TokenSolanaCreatorRewards creatorWallet={token.deployerAddress} />
            ) : null}
          </div>

          <section
            className="order-4 min-w-0 lg:order-none"
            aria-labelledby="token-market-details-heading"
            data-testid="token-market-details"
          >
            <h2
              id="token-market-details-heading"
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
            >
              Market
            </h2>
            <dl className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-0.5">
              <MarketGroup>
                <DetailRow label="Pair">
                  <span
                    className="inline-flex items-center justify-end gap-1.5"
                    data-testid="token-detail-pair"
                  >
                    <span className="font-mono text-[12px]">${token.symbol}</span>
                    <span className="text-[var(--muted-2)]" aria-hidden>
                      /
                    </span>
                    <QuoteAssetBadge
                      symbol={quoteSymbol}
                      imageUrl={quoteImageUrl}
                      className="rounded-[var(--radius-sm)] px-1 py-0.5 shadow-none"
                    />
                  </span>
                </DetailRow>
                <DetailRow label="Holders">
                  <span data-testid="token-detail-holders">{holders ?? '—'}</span>
                </DetailRow>
                <DetailRow label="Launched">
                  <span data-testid="token-detail-launched">{age}</span>
                </DetailRow>
                {showProgress ? (
                  <DetailRow label="Bonding">
                    <span data-testid="token-bonding-progress">
                      {formatProgressPercent(token.launchProgressBps)}
                    </span>
                  </DetailRow>
                ) : null}
              </MarketGroup>

              <MarketGroup>
                <DetailRow label={isPump ? 'Mint' : 'Contract'}>
                  <ContractCopy
                    address={token.tokenAddress}
                    className="min-h-0 py-0"
                    label={
                      isPump
                        ? `Copy mint ${token.tokenAddress}`
                        : `Copy contract ${token.tokenAddress}`
                    }
                  />
                </DetailRow>
                <DetailRow label="Network">
                  <span data-testid="token-network-badge" className="inline-flex justify-end">
                    {(() => {
                      const networkId = networkBadgeIdForToken({
                        chainId: token.chainId,
                        marketSource: token.marketSource,
                      });
                      if (networkId) {
                        return <NetworkBadge network={networkId} />;
                      }
                      return isPump ? 'Solana' : 'Robinhood Chain';
                    })()}
                  </span>
                </DetailRow>
                <DetailRow label="Source">
                  <span data-testid="token-market-source">
                    {isPump ? 'Pump.fun' : isPons ? 'Pons' : 'SCOOP'}
                  </span>
                </DetailRow>
                {isPump && pumpUrl ? (
                  <DetailRow label="Pump.fun">
                    <a
                      href={pumpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-[var(--scoop-green)] underline-offset-2 hover:underline"
                      data-testid="token-pump-fun-link"
                    >
                      Open coin →
                    </a>
                  </DetailRow>
                ) : null}
                {isPump && mintExplorerUrl ? (
                  <DetailRow label="Explorer">
                    <a
                      href={mintExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-[var(--scoop-green)] underline-offset-2 hover:underline"
                      data-testid="token-solana-mint-link"
                    >
                      View mint →
                    </a>
                  </DetailRow>
                ) : null}
                {isPump && launchExplorerUrl ? (
                  <DetailRow label="Launch tx">
                    <a
                      href={launchExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[11px] text-[var(--scoop-green)] underline-offset-2 hover:underline"
                      data-testid="token-solana-tx-link"
                    >
                      View signature →
                    </a>
                  </DetailRow>
                ) : null}
                {isPons && token.curveAddress ? (
                  <DetailRow label="Curve">
                    <ContractCopy address={token.curveAddress} className="min-h-0 py-0" />
                    <span className="sr-only" data-testid="token-curve-address">
                      {token.curveAddress}
                    </span>
                  </DetailRow>
                ) : null}
                {!isPons && !isPump && token.poolId ? (
                  <DetailRow label="Pool">
                    <span className="font-mono text-[11px]" title={token.poolId}>
                      {truncateAddress(token.poolId, 6, 4)}
                    </span>
                    <span className="sr-only" data-testid="token-pool-id">
                      {token.poolId}
                    </span>
                  </DetailRow>
                ) : null}
                <DetailRow label="Deployer">
                  <ContractCopy address={token.deployerAddress} className="min-h-0 py-0" />
                </DetailRow>
                <DetailRow label="Creator">
                  <ContractCopy
                    address={isPump ? token.deployerAddress : token.creatorId}
                    className="min-h-0 py-0"
                  />
                  <span className="sr-only" data-testid="token-creator-id">
                    {isPump ? token.deployerAddress : token.creatorId}
                  </span>
                </DetailRow>
              </MarketGroup>

              {showScoopFeePanel ? (
              <MarketGroup>
                <DetailRow label="Trading fee">
                  <span data-testid="token-detail-trading-fee">{tradingFee ?? '—'}</span>
                </DetailRow>
                <DetailRow label="Creator share">
                  <span
                    data-testid="token-detail-creator-share"
                    title="Share of collected trading fees"
                  >
                    {creatorShare ?? '—'}
                  </span>
                </DetailRow>
                <DetailRow label="Creator earnings">
                  <span data-testid="token-detail-creator-earnings">
                    {creatorEarningsLines ? (
                      <span className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
                        {creatorEarningsLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </DetailRow>
                <DetailRow label="Buyback allocation">
                  <span data-testid="token-detail-protocol-buyback">
                    {buybackAllocationLines ? (
                      <span className="flex flex-col items-end gap-0.5 font-mono tabular-nums">
                        {buybackAllocationLines.map((line) => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    ) : (
                      '—'
                    )}
                  </span>
                </DetailRow>
              </MarketGroup>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Client entry: SSR seed → live provider → synchronized market surfaces. */
export function TokenMarketLiveView({
  token,
  quoteSymbol,
  quoteImageUrl = null,
  lore = null,
}: Props) {
  return (
    <TokenMarketLiveProvider initialToken={token}>
      <TokenMarketLiveBody
        quoteSymbol={quoteSymbol}
        quoteImageUrl={quoteImageUrl}
        lore={lore}
      />
    </TokenMarketLiveProvider>
  );
}
