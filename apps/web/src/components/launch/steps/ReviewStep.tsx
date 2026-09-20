'use client';

import type { ReactNode } from 'react';
import type { LaunchFormState } from '@/lib/launch/types';
import {
  isLaunchTxBusy,
  isMarketLivePhase,
  launchTxStatusLabel,
  tokenMarketPath,
  type LaunchTxState,
} from '@/lib/launch/tx-state';
import { canShowViewMarket, completionPanelCopy } from '@/lib/launch/completion-panel-copy';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_LABEL } from '@/lib/brand';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { formatEthWei, parseEthDevBuyWei } from '@/lib/launch/dev-buy';
import { truncateAddress } from '@/lib/format';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { PONS_DEV_BUY_SLIPPAGE_BPS } from '@/lib/launch/adapters/pons/constants';
import {
  devSupplyOption,
  isBurnDevSupplyPolicy,
  type DevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';
import { burnFundingNote, lockFundingNote } from '@/lib/launch/burn-orchestrate';
import {
  CREATOR_FEE_REVIEW_DETAIL,
  creatorFeeLabel,
} from '@/lib/launch/creator-fee';
import { isPumpRail, launchRailLabel } from '@/lib/launch/launch-rail';
import type { LaunchResult } from '@/lib/launch/launch-result';
import {
  pumpFunCoinUrl,
  solanaExplorerAddressUrl,
  solanaExplorerTxUrl,
} from '@/lib/solana/explorer';

type Props = {
  state: LaunchFormState;
  connectedAddress: string | null | undefined;
  /** Solana wallet when rail = Pump. */
  solanaAddress?: string | null;
  tx: LaunchTxState;
  schemaBlocked?: boolean;
  /** Temporary Pump success (Gate D/E) — not an EVM token page. */
  pumpResult?: LaunchResult | null;
  /** Persistence failed after on-chain confirm — retry without relaunch. */
  pumpPersistError?: string | null;
  onRetryPumpPersist?: () => void;
  onRetryIndex?: () => void;
  onRetryNews?: () => void;
  onViewMarket?: () => void;
  onResumeLock?: () => void;
};

/**
 * Gate 7 / Gate D public review — Pons V2 + HoodLock, or Pump CREATE ONLY.
 */
export function ReviewStep({
  state,
  connectedAddress,
  solanaAddress,
  tx,
  schemaBlocked = false,
  pumpResult = null,
  pumpPersistError = null,
  onRetryPumpPersist,
  onRetryIndex,
  onRetryNews,
  onViewMarket,
  onResumeLock,
}: Props) {
  const pump = isPumpRail(state.launchRail);

  if (pump) {
    return (
      <PumpReview
        state={state}
        solanaAddress={solanaAddress}
        tx={tx}
        pumpResult={pumpResult}
        pumpPersistError={pumpPersistError}
        onRetryPumpPersist={onRetryPumpPersist}
      />
    );
  }

  const buy = parseEthDevBuyWei(state.devBuyAmount);
  const buyWei = buy.ok ? buy.amount : BigInt(0);
  const busy = isLaunchTxBusy(tx.phase);
  const supply = devSupplyOption(state.devSupplyPolicy);
  const burn = isBurnDevSupplyPolicy(state.devSupplyPolicy);
  const creatorFeeBps = tx.persistedCreatorTaxBps ?? state.creatorFeeBps;
  const ticker = tx.indexedLaunch?.symbol ?? tx.decoded?.symbol ?? state.ticker;
  const tokenAddr = tx.indexedLaunch?.tokenAddress ?? tx.decoded?.token ?? null;
  const marketHref = tokenAddr ? tokenMarketPath(tokenAddr) : null;

  const showPostReceipt =
    tx.phase === 'lock_verified' ||
    tx.phase === 'burn_verified' ||
    tx.phase === 'receipt_success' ||
    tx.phase === 'receipt_success_details_pending' ||
    tx.phase === 'waiting_for_indexer' ||
    tx.phase === 'indexed' ||
    tx.phase === 'activating_news' ||
    tx.phase === 'market_live' ||
    tx.phase === 'indexing_timeout' ||
    tx.phase === 'news_activation_failed' ||
    tx.phase === 'index_mismatch';

  const showLockResume =
    tx.phase === 'lock_required' ||
    (tx.phase === 'failed' && Boolean(tx.txHash) && Boolean(tx.decoded?.token));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Review & launch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {burn
            ? 'Pons launches the token with your ETH dev buy, then the full dev allocation is burned. You may confirm two wallet transactions.'
            : 'Pons launches the token with your ETH dev buy, then HoodLock locks those tokens. You may confirm up to three wallet transactions.'}
        </p>
      </div>

      {schemaBlocked ? (
        <p
          className="rounded-[var(--radius-md)] border border-[#b42318]/40 px-4 py-3 font-mono text-[12px] text-[#b42318]"
          role="alert"
          data-testid="pons-schema-blocked"
        >
          BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY
        </p>
      ) : null}

      {showPostReceipt ? (
        <CompletionPanel
          tx={tx}
          ticker={ticker}
          tokenName={tx.indexedLaunch?.name ?? tx.decoded?.name ?? state.name}
          previewUrl={state.image.previewUrl}
          marketHref={marketHref}
          policy={state.devSupplyPolicy}
          onRetryIndex={onRetryIndex}
          onRetryNews={onRetryNews}
          onViewMarket={onViewMarket}
        />
      ) : null}

      {showLockResume && onResumeLock ? (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3"
          data-testid="hoodlock-resume-panel"
        >
          <p className="text-sm font-medium text-[var(--fg)]">
            Token launched successfully.
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {burn
              ? 'Dev-supply burn is incomplete. Resume burn — do not launch again.'
              : 'Dev-token lock is incomplete. Resume locking — do not launch again.'}
          </p>
          <button
            type="button"
            className="mt-3 min-h-10 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            onClick={onResumeLock}
          >
            {burn ? 'Resume burn →' : 'Resume locking →'}
          </button>
        </div>
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
          {launchTxStatusLabel(tx.phase, state.devSupplyPolicy)}
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
              <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-green)] font-mono text-[11px] text-[var(--scoop-green-contrast)]">
                Scoop
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-[12px] text-[var(--muted)]">${state.ticker}</p>
              <p className="text-[17px] font-semibold tracking-tight">{state.name}</p>
              <p className="line-clamp-3 text-sm text-[var(--muted)]">{state.description}</p>
              {state.image.ipfsUri ? (
                <p className="font-mono text-[10px] text-[var(--muted-2)]">IPFS ready</p>
              ) : (
                <p className="font-mono text-[10px] text-[var(--muted-2)]">
                  Will pin to IPFS on launch
                </p>
              )}
            </div>
          </div>
        </TicketBlock>

        <TicketBlock title="Pons launch">
          <dl className="space-y-2 text-sm" data-testid="pons-launch-summary">
            <Row label="Pair" value="ETH" />
            <Row
              label="Dev buy"
              value={buyWei > BigInt(0) ? `${formatEthWei(buyWei)} ETH` : '—'}
            />
            <Row label="Launch config" value="0 (ETH)" />
            <Row label="Creator Fee" value={creatorFeeLabel(creatorFeeBps)} />
            <Row label="Pons buyback" value="Enabled" />
            <Row label="Slippage" value={`${PONS_DEV_BUY_SLIPPAGE_BPS / 100}%`} />
            <Row label="Chain" value={`${ROBINHOOD_CHAIN_LABEL} (${ROBINHOOD_CHAIN_ID})`} />
          </dl>
          <p className="mt-3 text-sm text-[var(--muted)]" data-testid="creator-fee-review">
            Creator Fee: {creatorFeeLabel(creatorFeeBps)}. {CREATOR_FEE_REVIEW_DETAIL}
          </p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            Launch fee is read live from the Pons factory at submit time (not hardcoded).
          </p>
        </TicketBlock>

        <TicketBlock title="Dev supply">
          <dl className="space-y-2 text-sm" data-testid="dev-supply-summary">
            <Row label="Dev Supply" value={supply.reviewValue} />
            {burn ? null : (
              <>
                <Row label="Approval" value="Exact amount only" />
                <Row label="Lock fee" value="Live onchain read" />
              </>
            )}
          </dl>
          <p className="mt-3 text-sm text-[var(--muted)]" data-testid="dev-supply-review-detail">
            {supply.reviewDetail}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]" data-testid="dev-supply-funding">
            {burn ? burnFundingNote() : lockFundingNote()}
          </p>
        </TicketBlock>

        <TicketBlock title="Creator wallet">
          <p className="font-mono text-[13px]" data-testid="creator-wallet">
            {connectedAddress ? truncateAddress(connectedAddress) : 'Connect a wallet'}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Connected wallet is deployer, fee recipient, and buy recipient
            {burn ? '.' : ', and HoodLock owner.'}
          </p>
        </TicketBlock>

        {tx.txHash ? (
          <TicketBlock title="Transactions">
            <p className="font-mono text-[12px] break-all">
              <a
                href={robinhoodTxUrl(tx.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--scoop-green)] underline-offset-2 hover:underline"
              >
                {tx.txHash}
              </a>
            </p>
            {tokenAddr ? (
              <div className="mt-2">
                <ContractCopy address={tokenAddr} />
              </div>
            ) : null}
          </TicketBlock>
        ) : null}
      </div>
    </div>
  );
}

function PumpReview({
  state,
  solanaAddress,
  tx,
  pumpResult,
  pumpPersistError,
  onRetryPumpPersist,
}: {
  state: LaunchFormState;
  solanaAddress?: string | null;
  tx: LaunchTxState;
  pumpResult: LaunchResult | null;
  pumpPersistError?: string | null;
  onRetryPumpPersist?: () => void;
}) {
  const busy = isLaunchTxBusy(tx.phase);
  const showSuccess =
    Boolean(pumpResult) ||
    (tx.phase === 'receipt_success' && Boolean(tx.txHash)) ||
    (tx.phase === 'market_live' && Boolean(tx.txHash));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Review & launch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Create a coin on Pump.fun (Solana). No initial buy in this release — you
          confirm one wallet transaction.
        </p>
      </div>

      {showSuccess && (pumpResult || tx.txHash) ? (
        <PumpSuccessPanel
          result={
            pumpResult ??
            ({
              chain: 'solana',
              provider: 'pump',
              assetAddress: '',
              txHash: tx.txHash!,
            } satisfies LaunchResult)
          }
          name={state.name}
          ticker={state.ticker}
          previewUrl={state.image.previewUrl}
          persistError={pumpPersistError}
          onRetryPersist={onRetryPumpPersist}
        />
      ) : null}

      {tx.phase === 'failed' && tx.error ? (
        <div className="space-y-2">
          <p
            className="rounded-[var(--radius-md)] border border-[#b42318]/40 px-4 py-3 font-mono text-[12px] text-[#b42318]"
            role="alert"
            data-testid="launch-tx-error"
          >
            {tx.error}
          </p>
          {tx.txHash ? (
            <p className="font-mono text-[12px] break-all" data-testid="pump-uncertain-sig">
              Signature:{' '}
              <a
                href={solanaExplorerTxUrl(tx.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--scoop-green)] underline-offset-2 hover:underline"
              >
                {tx.txHash}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {busy && !showSuccess ? (
        <p
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]"
          role="status"
          data-testid="launch-tx-phase"
        >
          {pumpLaunchPhaseLabel(tx.phase)}
        </p>
      ) : null}

      {!showSuccess ? (
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
                <div className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-green)] font-mono text-[11px] text-[var(--scoop-green-contrast)]">
                  Scoop
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="font-mono text-[12px] text-[var(--muted)]">${state.ticker}</p>
                <p className="text-[17px] font-semibold tracking-tight">{state.name}</p>
                <p className="line-clamp-3 text-sm text-[var(--muted)]">{state.description}</p>
              </div>
            </div>
          </TicketBlock>

          <TicketBlock title="Pump.fun launch">
            <dl className="space-y-2 text-sm" data-testid="pump-launch-summary">
              <Row label="Network" value="Solana" />
              <Row label="Launch via" value="Pump.fun" />
              <Row label="Rail" value={launchRailLabel(state.launchRail)} />
              <Row label="Pair" value="SOL" />
              <Row label="Initial buy" value="None" />
              <Row label="Name" value={state.name.trim() || '—'} />
              <Row label="Ticker" value={state.ticker.trim() || '—'} />
            </dl>
          </TicketBlock>

          <TicketBlock title="Creator wallet">
            <p className="font-mono text-[13px]" data-testid="pump-creator-wallet">
              {solanaAddress ? truncateAddress(solanaAddress, 6, 4) : 'Connect a Solana wallet'}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Connected Solana wallet is creator, user, and fee payer.
            </p>
          </TicketBlock>
        </div>
      ) : null}
    </div>
  );
}

function pumpLaunchPhaseLabel(phase: LaunchTxState['phase']): string {
  switch (phase) {
    case 'preparing_artwork':
      return 'Preparing metadata…';
    case 'simulating':
      return 'Building Pump.fun transaction…';
    case 'awaiting_wallet':
      return 'Awaiting wallet signature…';
    case 'submitted':
      return 'Broadcasting to Solana…';
    case 'confirming':
      return 'Confirming launch…';
    case 'receipt_success':
      return 'Complete';
    default:
      return launchTxStatusLabel(phase);
  }
}

function PumpSuccessPanel({
  result,
  name,
  ticker,
  previewUrl,
  persistError,
  onRetryPersist,
}: {
  result: LaunchResult;
  name: string;
  ticker: string;
  previewUrl: string | null;
  persistError?: string | null;
  onRetryPersist?: () => void;
}) {
  const mint = result.assetAddress;
  const sig = result.txHash;

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-4"
      data-testid="pump-launch-success"
    >
      <div className="flex gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-12 w-12 rounded-[var(--radius-sm)] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {persistError
              ? 'Coin created — saving to SCOOP failed'
              : 'Coin created on Pump.fun'}
          </p>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Solana · confirmed
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {persistError
              ? 'Your Pump transaction is confirmed. Retry saving to open the SCOOP token page — do not launch again.'
              : 'Saving your SCOOP market and opening the token page…'}
          </p>
          <p className="mt-2 font-mono text-[12px]">
            {name} · ${ticker}
          </p>
        </div>
      </div>

      {persistError ? (
        <div className="mt-3 space-y-2">
          <p
            className="font-mono text-[12px] text-[#b42318]"
            role="alert"
            data-testid="pump-persist-error"
          >
            {persistError}
          </p>
          {onRetryPersist ? (
            <button
              type="button"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
              onClick={onRetryPersist}
              data-testid="pump-persist-retry"
            >
              Retry save →
            </button>
          ) : null}
        </div>
      ) : null}

      {mint ? (
        <div className="mt-3 space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            Mint
          </p>
          <ContractCopy address={mint} />
          <a
            href={solanaExplorerAddressUrl(mint)}
            target="_blank"
            rel="noreferrer"
            className="inline-block font-mono text-[11px] text-[var(--scoop-green)] underline-offset-4 hover:underline"
          >
            View mint on explorer →
          </a>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-3">
        {mint ? (
          <a
            href={pumpFunCoinUrl(mint)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            data-testid="pump-fun-link"
          >
            Open on Pump.fun →
          </a>
        ) : null}
        {sig ? (
          <a
            href={solanaExplorerTxUrl(sig)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            data-testid="pump-explorer-tx"
          >
            View transaction →
          </a>
        ) : null}
      </div>
    </div>
  );
}

function TicketBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-4">
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-mono text-[12px]">{value}</dd>
    </div>
  );
}

function CompletionPanel({
  tx,
  ticker,
  tokenName,
  previewUrl,
  marketHref,
  policy,
  onRetryIndex,
  onRetryNews,
  onViewMarket,
}: {
  tx: LaunchTxState;
  ticker: string;
  tokenName: string;
  previewUrl: string | null;
  marketHref: string | null;
  policy: DevSupplyPolicy;
  onRetryIndex?: () => void;
  onRetryNews?: () => void;
  onViewMarket?: () => void;
}) {
  const copy = completionPanelCopy(tx, ticker, policy);
  const live = isMarketLivePhase(tx.phase);
  const showView = canShowViewMarket(tx.phase, marketHref);

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-4"
      data-testid={copy.testId}
    >
      <div className="flex gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="h-12 w-12 rounded-[var(--radius-sm)] object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{copy.title}</p>
          {copy.primary ? (
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              {copy.primary}
            </p>
          ) : null}
          <p className="mt-1 text-sm text-[var(--muted)]">{copy.body}</p>
          {copy.syncHint ? (
            <p className="mt-1 text-[12px] text-[var(--muted-2)]">{copy.syncHint}</p>
          ) : null}
          <p className="mt-2 font-mono text-[12px]">
            {tokenName} · ${ticker}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {tx.phase === 'indexing_timeout' && onRetryIndex ? (
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            onClick={onRetryIndex}
          >
            Retry indexing
          </button>
        ) : null}
        {tx.phase === 'news_activation_failed' && onRetryNews ? (
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            onClick={onRetryNews}
          >
            Retry news link
          </button>
        ) : null}
        {showView && onViewMarket ? (
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
            onClick={onViewMarket}
          >
            View {live ? 'token' : 'market'} →
          </button>
        ) : null}
      </div>
    </div>
  );
}
