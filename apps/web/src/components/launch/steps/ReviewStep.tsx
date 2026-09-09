'use client';

import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  LAUNCH_FEE_ETH,
  PROTOCOL_FEE_SPLIT,
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
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_LABEL } from '@/lib/brand';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { truncateAddress } from '@/lib/format';

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
  const buy = hasDevBuy(state);
  const recipient = resolveCreatorRecipient(state, connectedAddress);
  const busy = isLaunchTxBusy(tx.phase);
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
                Creator rewards · {PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100}%
              </dt>
              <dd
                className="mt-1 whitespace-pre-line font-mono text-[14px] text-[var(--fg)]"
                data-testid="review-creator-recipient"
              >
                {creatorLines.join('\n')}
              </dd>
            </div>
            <Row
              label="Deployer fees"
              value={`${PROTOCOL_FEE_SPLIT.deployerBps / 100}% → launching wallet`}
            />
            <Row
              label="Protocol · buybacks"
              value={`${PROTOCOL_FEE_SPLIT.buybackBps / 100}%`}
            />
            <Row
              label="Protocol · operations"
              value={`${PROTOCOL_FEE_SPLIT.operationsBps / 100}%`}
            />
          </dl>
        </TicketBlock>

        <TicketBlock title="Dev buy">
          {buy ? (
            <>
              <p className="font-mono text-[14px] tabular-nums">
                {state.devBuyAmount} {quoteSymbol}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Initial buy is not included in this launch. V2.C submits{' '}
                <span className="font-mono">launch</span> only (no{' '}
                <span className="font-mono">launchAndBuy</span>).
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No initial buy</p>
          )}
        </TicketBlock>

        <TicketBlock title="Costs">
          <dl className="space-y-2 text-sm">
            <Row label="Launch fee" value={`${LAUNCH_FEE_ETH} ETH`} />
            <Row label="Native value" value={`${LAUNCH_FEE_ETH} ETH (msg.value)`} />
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
  marketHref,
  onRetryIndex,
  onRetryNews,
  onViewMarket,
}: {
  tx: LaunchTxState;
  ticker: string;
  marketHref: string | null;
  onRetryIndex?: () => void;
  onRetryNews?: () => void;
  onViewMarket?: () => void;
}) {
  const live = isMarketLivePhase(tx.phase);
  const indexing =
    tx.phase === 'receipt_success' ||
    tx.phase === 'waiting_for_indexer' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news';

  let title = 'Launch transaction confirmed';
  let body = 'Waiting for market indexing… MARKET LIVE is not claimed yet.';
  let testId = 'launch-receipt-success';

  if (tx.phase === 'waiting_for_indexer' || tx.phase === 'receipt_success') {
    title = 'Launch confirmed';
    body = 'Getting your market ready…';
    testId = 'launch-waiting-indexer';
  } else if (tx.phase === 'activating_news') {
    title = 'Market indexed';
    body = 'Linking News article…';
    testId = 'launch-activating-news';
  } else if (tx.phase === 'indexed') {
    title = 'Market indexed';
    body = 'Preparing MARKET LIVE…';
    testId = 'launch-indexed';
  } else if (live) {
    title = 'MARKET LIVE';
    body = `$${ticker} is now live on SCOOP.`;
    testId = 'launch-market-live';
  } else if (tx.phase === 'indexing_timeout') {
    title = 'Your launch is confirmed on-chain.';
    body =
      'SCOOP is still indexing the market. You can retry or open the transaction.';
    testId = 'launch-indexing-timeout';
  } else if (tx.phase === 'index_mismatch') {
    title = 'Indexed data mismatch';
    body =
      tx.error ??
      'Canonical indexed launch does not match the receipt. Navigation blocked.';
    testId = 'launch-index-mismatch';
  } else if (tx.phase === 'receipt_success_details_pending') {
    title = 'Launch transaction confirmed';
    body =
      'Confirmed on-chain — launch details pending decode. Indexing cannot start without the token address.';
    testId = 'launch-receipt-success';
  }

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3"
      role="status"
      data-testid={testId}
    >
      <p className="text-[15px] font-semibold tracking-tight">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{body}</p>

      {tx.newsActivation === 'failed' && live ? (
        <p
          className="mt-2 text-sm text-[var(--muted)]"
          data-testid="launch-news-sync-warning"
        >
          Market is live. News link is still syncing.
        </p>
      ) : null}

      {tx.txHash ? (
        <p className="mt-2 font-mono text-[11px] break-all text-[var(--muted-2)]">
          {tx.txHash}
        </p>
      ) : null}

      {tx.decoded?.token && !live ? (
        <p className="mt-2 font-mono text-[12px] text-[var(--fg)]">
          Token {truncateAddress(tx.decoded.token)}
        </p>
      ) : null}

      {indexing ? (
        <p
          className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
          data-testid="launch-tx-phase"
        >
          {launchTxStatusLabel(tx.phase)}
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
            Retry indexing check
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

        {(live || tx.phase === 'indexing_timeout') && marketHref ? (
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
