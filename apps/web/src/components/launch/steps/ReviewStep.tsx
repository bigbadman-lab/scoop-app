'use client';

import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  LAUNCH_FEE_ETH,
  LAUNCH_FEE_WEI,
  type LaunchFormState,
} from '@/lib/launch/types';
import { hasDevBuy } from '@/lib/launch/validation';
import {
  creatorRecipientLabel,
  isCreatorResolved,
  resolveCreatorRecipient,
} from '@/lib/launch/creator-recipient';
import {
  isLaunchTxBusy,
  isMarketLivePhase,
  launchTxStatusLabel,
  tokenMarketPath,
  type LaunchTxState,
} from '@/lib/launch/tx-state';
import {
  canShowViewMarket,
  completionPanelCopy,
} from '@/lib/launch/completion-panel-copy';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_LABEL } from '@/lib/brand';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import {
  formatEthWei,
  formatQuoteRaw,
  isNativeEthQuote,
  parseDevBuyAmount,
} from '@/lib/launch/dev-buy';
import { truncateAddress } from '@/lib/format';
import {
  AdditionalFeeDestination,
  BASE_FEE,
  computeEffectiveFeeRouting,
  CreatorAllocationDestination,
  formatTradingFeePercent,
} from '@scoop/shared';
import { canLaunchCanonicalProduction } from '@/lib/launch/execute';
import { ContractCopy } from '@/components/ui/ContractCopy';

type Props = {
  state: LaunchFormState;
  catalogue: readonly PublicQuoteCatalogueItem[];
  connectedAddress: string | null | undefined;
  tx: LaunchTxState;
  onRetryIndex?: () => void;
  onRetryNews?: () => void;
  onViewMarket?: () => void;
};

export function ReviewStep({
  state,
  catalogue,
  connectedAddress,
  tx,
  onRetryIndex,
  onRetryNews,
  onViewMarket,
}: Props) {
  const quote = catalogue.find(
    (q) => q.quoteAsset.toLowerCase() === state.quoteAsset?.toLowerCase(),
  );
  const quoteSymbol = state.quoteSymbol ?? quote?.displaySymbol ?? '—';
  const quoteDecimals =
    state.quoteDecimals ??
    quote?.decimals ??
    (isNativeEthQuote(state.quoteAsset) ? 18 : null);
  const buy = hasDevBuy(state);
  const parsedBuy =
    buy && quoteDecimals != null
      ? parseDevBuyAmount({
          raw: state.devBuyAmount,
          decimals: quoteDecimals,
          quoteSymbol,
          quoteAsset: state.quoteAsset,
        })
      : null;
  const buyRaw =
    parsedBuy && parsedBuy.ok && parsedBuy.amount > BigInt(0)
      ? parsedBuy.amount
      : BigInt(0);
  const buyActive = buyRaw > BigInt(0);
  const nativeQuote = isNativeEthQuote(state.quoteAsset);
  const msgValueWei = nativeQuote ? LAUNCH_FEE_WEI + buyRaw : LAUNCH_FEE_WEI;
  const recipient = resolveCreatorRecipient(state, connectedAddress);
  const busy = isLaunchTxBusy(tx.phase);
  const routing = computeEffectiveFeeRouting({
    creatorAllocationDestination: state.creatorAllocationDestination,
    additionalFee: state.additionalFee,
    additionalFeeDestination: state.additionalFeeDestination,
  });
  const baseAllocLabel =
    state.creatorAllocationDestination === CreatorAllocationDestination.Holders
      ? 'Holders'
      : 'Creator';
  const extraDestLabel =
    state.additionalFeeDestination === AdditionalFeeDestination.Holders
      ? 'Holders'
      : state.additionalFeeDestination === AdditionalFeeDestination.Deployer
        ? 'Deployer'
        : 'Creator';
  const canonicalReady = canLaunchCanonicalProduction();
  const ticker =
    tx.indexedLaunch?.symbol ?? tx.decoded?.symbol ?? state.ticker;
  const tokenAddr =
    tx.indexedLaunch?.tokenAddress ?? tx.decoded?.token ?? null;
  const marketHref = tokenAddr ? tokenMarketPath(tokenAddr) : null;

  let creatorLines: string[] = ['Unresolved'];
  if (isCreatorResolved(recipient) && recipient.type === 'wallet') {
    creatorLines = [
      creatorRecipientLabel(recipient),
      truncateAddress(recipient.address),
    ];
  }

  const showPostReceipt =
    tx.phase === 'receipt_success' ||
    tx.phase === 'receipt_success_details_pending' ||
    tx.phase === 'waiting_for_indexer' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news' ||
    tx.phase === 'market_live' ||
    tx.phase === 'indexing_timeout' ||
    tx.phase === 'news_activation_failed' ||
    tx.phase === 'index_mismatch';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Review & launch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Confirm deployer and creator rewards, then submit. Simulation runs before
          your wallet opens.
        </p>
      </div>

      {showPostReceipt ? (
        <CompletionPanel
          tx={tx}
          ticker={ticker}
          tokenName={tx.indexedLaunch?.name ?? tx.decoded?.name ?? state.name}
          quoteSymbol={quoteSymbol}
          marketHref={marketHref}
          onRetryIndex={onRetryIndex}
          onRetryNews={onRetryNews}
          onViewMarket={onViewMarket}
        />
      ) : null}

      {tx.phase === 'failed' && tx.error ? (
        <p
          className="rounded-[var(--radius-md)] border border-[#b42318]/40 px-4 py-3 font-mono text-[12px] text-[#b42318]"
          role="alert"
          data-testid="launch-tx-error"
        >
          {tx.error}
        </p>
      ) : null}

      {busy && !showPostReceipt ? (
        <p
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]"
          role="status"
          data-testid="launch-tx-phase"
        >
          {launchTxStatusLabel(tx.phase)}
        </p>
      ) : null}

      <div className="space-y-0 divide-y divide-[var(--divider)] border border-[var(--divider)] rounded-[var(--radius-xl)]">
        <TicketBlock title="Token">
          <div className="flex gap-4">
            {state.image.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.image.previewUrl}
                alt=""
                className="h-16 w-16 rounded-[var(--radius-md)] object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] font-mono text-[11px] text-[var(--scoop-orange-contrast)]">
                Scoop
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-[12px] text-[var(--muted)]">${state.ticker}</p>
              <p className="text-[17px] font-semibold tracking-tight">{state.name}</p>
              <p className="line-clamp-3 text-sm text-[var(--muted)]">{state.description}</p>
              {state.image.ipfsUri ? (
                <p className="font-mono text-[10px] text-[var(--muted-2)]">
                  IPFS ready
                </p>
              ) : (
                <p className="font-mono text-[10px] text-[var(--muted-2)]">
                  Will pin to IPFS on launch
                </p>
              )}
            </div>
          </div>
        </TicketBlock>

        <TicketBlock title="Market">
          <div className="flex items-center gap-3">
            {quote?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={quote.imageUrl}
                alt=""
                className="h-10 w-10 rounded-[var(--radius-sm)] object-cover"
              />
            ) : null}
            <div>
              <p className="font-mono text-[14px] tracking-wide">
                ${state.ticker} / {quoteSymbol}
              </p>
              <p className="text-sm text-[var(--muted)]">{quote?.name ?? 'Quote asset'}</p>
            </div>
          </div>
        </TicketBlock>

        <TicketBlock title="Trading fees">
          <dl className="space-y-2 text-sm" data-testid="fee-economics-summary">
            <Row label="Base trading fee" value={formatTradingFeePercent(BASE_FEE)} />
            <Row
              label="Additional fee"
              value={`+${formatTradingFeePercent(routing.additionalFeeUnits)}`}
            />
            <Row
              label="Total trading fee"
              value={formatTradingFeePercent(routing.totalFeeUnits)}
            />
            <Row label="Base 70% allocation" value={baseAllocLabel} />
            {routing.additionalFeeUnits > 0 ? (
              <Row label="Additional destination" value={extraDestLabel} />
            ) : null}
          </dl>
          <dl
            className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3 text-sm"
            data-testid="fee-routing-breakdown"
          >
            {routing.creatorUnits > 0 ? (
              <Row label="Creator" value={formatTradingFeePercent(routing.creatorUnits)} />
            ) : null}
            {routing.holdersUnits > 0 ? (
              <Row label="Holders" value={formatTradingFeePercent(routing.holdersUnits)} />
            ) : null}
            <Row label="Deployer" value={formatTradingFeePercent(routing.deployerUnits)} />
            <Row label="Protocol" value={formatTradingFeePercent(routing.protocolUnits)} />
            <Row
              label="Operations"
              value={formatTradingFeePercent(routing.operationsUnits)}
            />
            <Row label="Total" value={formatTradingFeePercent(routing.totalFeeUnits)} />
          </dl>
          {routing.holdersUnits > 0 ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Holder rewards stay in the assets earned by the market — no swaps.
            </p>
          ) : null}
          <p
            className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]"
            data-testid="fee-immutable-warning"
          >
            Fee settings cannot be changed after launch.
          </p>
          {!canonicalReady ? (
            <p
              className="mt-2 text-sm text-[var(--muted)]"
              data-testid="canonical-launch-unavailable"
            >
              Canonical Factory is not deployed yet. You can configure fees, but launch
              broadcast is unavailable.
            </p>
          ) : null}
        </TicketBlock>

        <TicketBlock title="Wallets">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                Deployed by
              </dt>
              <dd className="mt-1 font-mono text-[14px]" data-testid="review-deployer-wallet">
                {connectedAddress
                  ? truncateAddress(connectedAddress)
                  : 'Connect a wallet'}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                Creator recipient
              </dt>
              <dd
                className="mt-1 whitespace-pre-line font-mono text-[14px] text-[var(--fg)]"
                data-testid="review-creator-recipient"
              >
                {creatorLines.join('\n')}
              </dd>
            </div>
            {buyActive ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                  Initial buy recipient
                </dt>
                <dd
                  className="mt-1 font-mono text-[14px]"
                  data-testid="review-buy-recipient"
                >
                  {connectedAddress
                    ? truncateAddress(connectedAddress)
                    : 'Connect a wallet'}
                  <span className="mt-1 block text-[var(--muted)]">
                    Purchased tokens go to the signing wallet (msg.sender), not
                    the creator recipient unless they are the same.
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </TicketBlock>

        <TicketBlock title="Dev buy">
          {buyActive && quoteDecimals != null ? (
            <>
              <p
                className="font-mono text-[14px] tabular-nums"
                data-testid="review-dev-buy-amount"
              >
                {formatQuoteRaw(buyRaw, quoteDecimals)} {quoteSymbol}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Submitted atomically with launch via{' '}
                <span className="font-mono">launchAndBuy</span>
                {nativeQuote
                  ? '.'
                  : `. ${quoteSymbol} is authorized to the Factory before launch; msg.value is launch fee only.`}
              </p>
            </>
          ) : buy && quoteDecimals == null ? (
            <p className="text-sm text-[#b42318]" role="alert">
              Quote decimals missing. Re-select the market pair before launch.
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]" data-testid="review-dev-buy-none">
              None
            </p>
          )}
        </TicketBlock>

        <TicketBlock title="Costs">
          <dl className="space-y-2 text-sm">
            <Row label="Launch fee" value={`${LAUNCH_FEE_ETH} ETH`} />
            {buyActive && quoteDecimals != null ? (
              <Row
                label="Initial dev buy"
                value={`${formatQuoteRaw(buyRaw, quoteDecimals)} ${quoteSymbol}`}
              />
            ) : null}
            <Row
              label="Total transaction value"
              value={`${formatEthWei(msgValueWei)} ETH (msg.value)`}
            />
            <Row
              label="Function"
              value={buyActive ? 'launchAndBuy' : 'launch'}
            />
            <Row label="Network" value={`${ROBINHOOD_CHAIN_LABEL} · ${ROBINHOOD_CHAIN_ID}`} />
          </dl>
        </TicketBlock>
      </div>
    </div>
  );
}

function CompletionPanel({
  tx,
  ticker,
  tokenName,
  quoteSymbol,
  marketHref,
  onRetryIndex,
  onRetryNews,
  onViewMarket,
}: {
  tx: LaunchTxState;
  ticker: string;
  tokenName: string;
  quoteSymbol: string;
  marketHref: string | null;
  onRetryIndex?: () => void;
  onRetryNews?: () => void;
  onViewMarket?: () => void;
}) {
  const live = isMarketLivePhase(tx.phase);
  const copy = completionPanelCopy(tx, ticker);
  const showViewMarket = canShowViewMarket(tx.phase, marketHref);
  const syncing =
    tx.phase === 'receipt_success' ||
    tx.phase === 'waiting_for_indexer' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news';

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3"
      role="status"
      data-testid={copy.testId}
    >
      <p className="text-[15px] font-semibold tracking-tight">{copy.title}</p>
      {copy.primary ? (
        <p
          className="mt-1 text-sm font-medium text-[var(--fg)]"
          data-testid="launch-market-live-status"
        >
          {copy.primary}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-[var(--muted)]">{copy.body}</p>

      {tx.newsActivation === 'failed' && live ? (
        <p
          className="mt-2 text-sm text-[var(--muted)]"
          data-testid="launch-news-sync-warning"
        >
          Market is live. News link is still syncing.
        </p>
      ) : null}

      {(tokenName || ticker) && tx.decoded?.token ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              Token
            </dt>
            <dd className="text-[var(--fg)]">
              {tokenName || ticker} (${ticker})
            </dd>
          </div>
          <div
            className="flex min-w-0 flex-col gap-1"
            data-testid="launch-token-contract"
          >
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              Token contract
            </dt>
            <dd className="min-w-0">
              <ContractCopy
                address={tx.decoded.token}
                display="full"
                feedback="text"
                label="Copy token contract address"
                copiedLabel="Token contract address copied"
                className="w-full justify-between gap-3 border border-[var(--divider)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--fg)] hover:border-[var(--fg)] hover:text-[var(--fg)] sm:text-[13px]"
              />
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              Pair
            </dt>
            <dd className="text-[var(--fg)]">
              ${ticker} / {quoteSymbol}
            </dd>
          </div>
        </dl>
      ) : null}

      {tx.txHash ? (
        <p className="mt-2 font-mono text-[11px] break-all text-[var(--muted-2)]">
          {tx.txHash}
        </p>
      ) : null}

      {copy.syncHint || syncing ? (
        <p
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
          data-testid="launch-tx-phase"
        >
          {copy.syncHint ?? launchTxStatusLabel(tx.phase)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3">
        {tx.phase === 'indexing_timeout' && onRetryIndex ? (
          <button
            type="button"
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-orange)] underline-offset-4 hover:underline"
            onClick={onRetryIndex}
            data-testid="launch-retry-index"
          >
            Retry sync check
          </button>
        ) : null}

        {tx.newsActivation === 'failed' && onRetryNews ? (
          <button
            type="button"
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-orange)] underline-offset-4 hover:underline"
            onClick={onRetryNews}
            data-testid="launch-retry-news"
          >
            Retry News link
          </button>
        ) : null}

        {showViewMarket && onViewMarket ? (
          <button
            type="button"
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-orange)] underline-offset-4 hover:underline"
            onClick={onViewMarket}
            data-testid="launch-view-market"
          >
            View market
          </button>
        ) : null}

        {tx.txHash && tx.phase === 'indexing_timeout' ? (
          <a
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
            href={robinhoodTxUrl(tx.txHash)}
            target="_blank"
            rel="noreferrer"
            data-testid="launch-open-tx"
          >
            Open transaction
          </a>
        ) : null}
      </div>
    </div>
  );
}

function TicketBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 md:px-5">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
        {label}
      </dt>
      <dd className="text-right text-[var(--fg)] sm:max-w-[60%]">{value}</dd>
    </div>
  );
}
