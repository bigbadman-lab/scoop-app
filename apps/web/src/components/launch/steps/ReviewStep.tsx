'use client';

import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  LAUNCH_FEE_ETH,
  PROTOCOL_FEE_SPLIT,
  type LaunchFormState,
} from '@/lib/launch/types';
import { hasDevBuy } from '@/lib/launch/validation';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_LABEL } from '@/lib/brand';
import { truncateAddress } from '@/lib/format';

type Props = {
  state: LaunchFormState;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

export function ReviewStep({ state, catalogue }: Props) {
  const quote = catalogue.find(
    (q) => q.quoteAsset.toLowerCase() === state.quoteAsset?.toLowerCase(),
  );
  const quoteSymbol = state.quoteSymbol ?? quote?.displaySymbol ?? '—';
  const buy = hasDevBuy(state);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Review & launch</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Launch ticket — confirm configuration before submitting. Writes stay
          disabled until wallet infrastructure is wired.
        </p>
      </div>

      <div className="space-y-0 divide-y divide-[var(--divider)] border border-[var(--divider)] rounded-[var(--radius-xl)]">
        {/* Token */}
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
              {(state.twitter || state.telegram) && (
                <p className="font-mono text-[11px] text-[var(--muted-2)]">
                  {[state.twitter && 'X', state.telegram && 'Telegram']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          </div>
        </TicketBlock>

        {/* Market */}
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

        {/* Earnings */}
        <TicketBlock title="Earnings">
          <dl className="space-y-2 text-sm">
            <Row
              label="Creator rewards"
              value={`${PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100}% → ${
                state.creatorMode === 'different'
                  ? truncateAddress(state.creatorAddress)
                  : state.creatorMode
              }`}
            />
            <Row
              label="Deployer fees"
              value={`${PROTOCOL_FEE_SPLIT.deployerBps / 100}% → launching wallet (protocol-fixed)`}
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

        {/* Dev buy */}
        <TicketBlock title="Dev buy">
          {buy ? (
            <p className="font-mono text-[14px] tabular-nums">
              {state.devBuyAmount} {quoteSymbol}
            </p>
          ) : (
            <p className="text-sm text-[var(--muted)]">No initial buy</p>
          )}
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            Approval state · deferred (no wallet write path)
          </p>
        </TicketBlock>

        {/* Costs */}
        <TicketBlock title="Costs">
          <dl className="space-y-2 text-sm">
            <Row label="Launch fee" value={`${LAUNCH_FEE_ETH} ETH`} />
            {buy ? (
              <Row
                label="Dev buy"
                value={`${state.devBuyAmount} ${quoteSymbol}`}
              />
            ) : null}
            <Row label="Gas estimate" value="Unavailable until wallet simulation" />
            <Row
              label="Native value"
              value={
                quoteSymbol === 'ETH' && buy
                  ? `${LAUNCH_FEE_ETH} ETH + ${state.devBuyAmount} ETH (exact msg.value)`
                  : `${LAUNCH_FEE_ETH} ETH launch fee` +
                    (buy ? ` · ERC-20 buy requires approval (deferred)` : '')
              }
            />
          </dl>
        </TicketBlock>

        {/* Network */}
        <TicketBlock title="Network">
          <p className="text-sm">{ROBINHOOD_CHAIN_LABEL}</p>
          <p className="mt-1 font-mono text-[12px] text-[var(--muted)]">
            Chain ID {ROBINHOOD_CHAIN_ID}
          </p>
        </TicketBlock>
      </div>

      <p
        className="rounded-[var(--radius-md)] border border-dashed border-[var(--divider)] px-4 py-3 font-mono text-[11px] text-[var(--muted)]"
        role="status"
      >
        Launch writes are deferred. Connect / switch / approve / submit require wallet
        infrastructure that is not present in this app yet. The CTA below cannot fake
        a launch.
      </p>
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
