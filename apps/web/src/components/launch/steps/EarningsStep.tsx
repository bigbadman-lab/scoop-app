'use client';

import {
  ADDITIONAL_FEE_PRESETS,
  ADDITIONAL_FEE_STEP,
  AdditionalFeeDestination,
  BASE_FEE,
  CreatorAllocationDestination,
  formatTradingFeePercent,
  MAX_ADDITIONAL_FEE,
  resolveAdditionalFeePreset,
} from '@scoop/shared';
import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';
import type { CreatorRecipientMode } from '@/lib/launch/types';
import {
  creatorRecipientLabel,
  isCreatorResolved,
  resolveCreatorRecipient,
} from '@/lib/launch/creator-recipient';
import { isNativeEthQuote } from '@/lib/launch/dev-buy';
import { truncateAddress } from '@/lib/format';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
  /** Live wagmi account — drives connected creator mode. */
  connectedAddress: string | null | undefined;
  onMode: (mode: CreatorRecipientMode) => void;
  onPatch: (patch: Partial<LaunchFormState>) => void;
};

const MODE_OPTIONS: {
  mode: CreatorRecipientMode;
  label: string;
  description: string;
  supported: boolean;
}[] = [
  {
    mode: 'connected',
    label: 'My connected wallet',
    description: 'Creator-routed fees go to the wallet currently connected to SCOOP.',
    supported: true,
  },
  {
    mode: 'custom',
    label: 'Another wallet',
    description: 'Send creator-routed fees to a different EVM address.',
    supported: true,
  },
  {
    mode: 'x',
    label: 'X account',
    description:
      'X creator rewards are coming next. Profiles will be resolved by immutable X user ID.',
    supported: false,
  },
];

const BASE_ALLOC_OPTIONS = [
  {
    value: CreatorAllocationDestination.Creator,
    label: 'Creator',
    description: '70% of the base 1% fee goes to the creator rewards vault.',
  },
  {
    value: CreatorAllocationDestination.Holders,
    label: 'Holders',
    description: '70% of the base 1% fee goes to holder rewards.',
  },
] as const;

const EXTRA_DEST_OPTIONS = [
  {
    value: AdditionalFeeDestination.Creator,
    label: 'Creator',
    description: 'Additional fee credited to the creator rewards vault.',
  },
  {
    value: AdditionalFeeDestination.Deployer,
    label: 'Deployer',
    description: 'Paid automatically to the deploying wallet — not a claimable balance.',
  },
  {
    value: AdditionalFeeDestination.Holders,
    label: 'Holders',
    description: 'Additional fee deposited into holder rewards.',
  },
] as const;

export function EarningsStep({
  state,
  errors,
  connectedAddress,
  onMode,
  onPatch,
}: Props) {
  const quoteLabel = state.quoteSymbol ?? 'QUOTE';
  const ethQuote = isNativeEthQuote(state.quoteAsset);
  const recipient = resolveCreatorRecipient(state, connectedAddress);
  const preset = resolveAdditionalFeePreset(state.additionalFee);
  const holdersSelected =
    state.creatorAllocationDestination === CreatorAllocationDestination.Holders ||
    (state.additionalFee > 0 &&
      state.additionalFeeDestination === AdditionalFeeDestination.Holders);

  function setAdditionalFee(units: number) {
    const clamped = Math.max(0, Math.min(MAX_ADDITIONAL_FEE, units));
    const stepped = Math.round(clamped / ADDITIONAL_FEE_STEP) * ADDITIONAL_FEE_STEP;
    onPatch({ additionalFee: stepped });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Configure how you participate economically
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          SCOOP&apos;s base trading fee is fixed at {formatTradingFeePercent(BASE_FEE)}. Optional
          additional fees are separate and immutable after launch.
        </p>
      </div>

      <section aria-labelledby="base-alloc-heading" className="space-y-2.5">
        <div>
          <h3
            id="base-alloc-heading"
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
          >
            Base 1% · creator allocation
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Where should the 70% creator allocation from SCOOP&apos;s base 1% fee go?
          </p>
        </div>
        <div
          className="space-y-1.5"
          role="radiogroup"
          aria-label="Base creator allocation destination"
        >
          {BASE_ALLOC_OPTIONS.map((opt) => {
            const selected = state.creatorAllocationDestination === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onPatch({ creatorAllocationDestination: opt.value })}
                className={[
                  'relative flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors',
                  selected
                    ? 'border-[var(--fg)] bg-[var(--bg-elevated)]'
                    : 'border-[var(--divider)] hover:border-[var(--fg)]',
                ].join(' ')}
              >
                {selected ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-[var(--scoop-orange)]"
                  />
                ) : null}
                <span className="text-[15px] font-semibold tracking-tight">{opt.label}</span>
                <span className="text-sm text-[var(--muted)]">{opt.description}</span>
              </button>
            );
          })}
        </div>
        {errors.creatorAllocationDestination ? (
          <p className="font-mono text-[11px] text-[#b42318]" role="alert">
            {errors.creatorAllocationDestination}
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="additional-fee-heading"
        className="space-y-2.5 border-t border-[var(--divider)] pt-4"
      >
        <div>
          <h3
            id="additional-fee-heading"
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
          >
            Optional additional fee
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Add an additional trading fee? This stacks on top of the base 1% (max total 3.0%).
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Additional fee presets">
          {ADDITIONAL_FEE_PRESETS.map((p) => {
            const selected = preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setAdditionalFee(p.units)}
                className={[
                  'min-h-10 rounded-[var(--radius-md)] border px-3 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors',
                  selected
                    ? 'border-[var(--fg)] bg-[var(--bg-elevated)] text-[var(--fg)]'
                    : 'border-[var(--divider)] text-[var(--muted)] hover:border-[var(--fg)]',
                ].join(' ')}
              >
                {p.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              if (preset !== 'custom') setAdditionalFee(ADDITIONAL_FEE_STEP);
            }}
            className={[
              'min-h-10 rounded-[var(--radius-md)] border px-3 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors',
              preset === 'custom'
                ? 'border-[var(--fg)] bg-[var(--bg-elevated)] text-[var(--fg)]'
                : 'border-[var(--divider)] text-[var(--muted)] hover:border-[var(--fg)]',
            ].join(' ')}
          >
            Custom
          </button>
        </div>
        {preset === 'custom' ||
        (state.additionalFee > 0 &&
          state.additionalFee !== 10_000 &&
          state.additionalFee !== 20_000) ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease additional fee by 0.1%"
              disabled={state.additionalFee <= 0}
              onClick={() => setAdditionalFee(state.additionalFee - ADDITIONAL_FEE_STEP)}
              className="min-h-10 min-w-10 rounded-[var(--radius-md)] border border-[var(--divider)] font-mono text-[16px] enabled:hover:border-[var(--fg)] disabled:opacity-40"
            >
              −
            </button>
            <p
              className="min-w-[4.5rem] text-center font-mono text-[15px] tabular-nums"
              data-testid="additional-fee-value"
            >
              +{formatTradingFeePercent(state.additionalFee)}
            </p>
            <button
              type="button"
              aria-label="Increase additional fee by 0.1%"
              disabled={state.additionalFee >= MAX_ADDITIONAL_FEE}
              onClick={() => setAdditionalFee(state.additionalFee + ADDITIONAL_FEE_STEP)}
              className="min-h-10 min-w-10 rounded-[var(--radius-md)] border border-[var(--divider)] font-mono text-[16px] enabled:hover:border-[var(--fg)] disabled:opacity-40"
            >
              +
            </button>
          </div>
        ) : (
          <p
            className="font-mono text-[13px] tabular-nums text-[var(--muted)]"
            data-testid="additional-fee-value"
          >
            Additional fee: +{formatTradingFeePercent(state.additionalFee)}
          </p>
        )}
        {errors.additionalFee ? (
          <p className="font-mono text-[11px] text-[#b42318]" role="alert">
            {errors.additionalFee}
          </p>
        ) : null}

        {state.additionalFee > 0 ? (
          <div className="space-y-1.5 pt-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
              Additional fee destination
            </p>
            <div
              className="space-y-1.5"
              role="radiogroup"
              aria-label="Additional fee destination"
            >
              {EXTRA_DEST_OPTIONS.map((opt) => {
                const selected = state.additionalFeeDestination === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onPatch({ additionalFeeDestination: opt.value })}
                    className={[
                      'relative flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors',
                      selected
                        ? 'border-[var(--fg)] bg-[var(--bg-elevated)]'
                        : 'border-[var(--divider)] hover:border-[var(--fg)]',
                    ].join(' ')}
                  >
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-[var(--scoop-orange)]"
                      />
                    ) : null}
                    <span className="text-[15px] font-semibold tracking-tight">
                      {opt.label}
                    </span>
                    <span className="text-sm text-[var(--muted)]">{opt.description}</span>
                  </button>
                );
              })}
            </div>
            {errors.additionalFeeDestination ? (
              <p className="font-mono text-[11px] text-[#b42318]" role="alert">
                {errors.additionalFeeDestination}
              </p>
            ) : null}
          </div>
        ) : null}

        {holdersSelected ? (
          <p
            className="text-sm text-[var(--muted)]"
            data-testid="holder-rewards-copy"
          >
            Holder rewards stay in the assets earned by the market — no swaps.
            {state.quoteSymbol && state.quoteSymbol !== 'ETH'
              ? ` ${quoteLabel}-side fees stay ${quoteLabel}.`
              : ''}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="creator-fee-heading" className="space-y-2.5 border-t border-[var(--divider)] pt-4">
          <div>
            <h3
              id="creator-fee-heading"
              className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
            >
              Creator recipient
            </h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Wallet identity for this launch
              {state.creatorAllocationDestination === CreatorAllocationDestination.Creator ||
              (state.additionalFee > 0 &&
                state.additionalFeeDestination === AdditionalFeeDestination.Creator)
                ? ' and creator-routed fees'
                : ''}
              .
            </p>
          </div>

          <div className="space-y-1.5" role="radiogroup" aria-label="Who receives creator rewards?">
            {MODE_OPTIONS.map((opt) => {
              const selected = state.creatorMode === opt.mode;
              return (
                <button
                  key={opt.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!opt.supported}
                  disabled={!opt.supported}
                  onClick={() => onMode(opt.mode)}
                  className={[
                    'relative flex w-full flex-col items-start gap-0.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? 'border-[var(--fg)] bg-[var(--bg-elevated)]'
                      : 'border-[var(--divider)]',
                    opt.supported
                      ? 'hover:border-[var(--fg)]'
                      : 'cursor-not-allowed opacity-55',
                  ].join(' ')}
                >
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r bg-[var(--scoop-orange)]"
                    />
                  ) : null}
                  <span className="text-[15px] font-semibold tracking-tight">{opt.label}</span>
                  <span className="text-sm text-[var(--muted)]">{opt.description}</span>
                  {!opt.supported ? (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                      Not available
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {state.creatorMode === 'connected' ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Creator rewards will go to
              </p>
              {isCreatorResolved(recipient) && recipient.type === 'wallet' ? (
                <p className="mt-1 font-mono text-[14px]" data-testid="creator-connected-address">
                  {truncateAddress(recipient.address)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[var(--muted)]">Connect a wallet to continue.</p>
              )}
            </div>
          ) : null}

          {state.creatorMode === 'custom' ? (
            <div>
              <label
                htmlFor="creator-address"
                className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]"
              >
                Creator rewards will go to
              </label>
              <input
                id="creator-address"
                value={state.creatorCustomAddress}
                onChange={(e) => onPatch({ creatorCustomAddress: e.target.value.trim() })}
                spellCheck={false}
                autoComplete="off"
                placeholder="Recipient address · 0x…"
                aria-label="Creator reward recipient address"
                className="mt-1.5 w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 font-mono text-[14px] outline-none placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]"
              />
              {errors.creatorCustomAddress ? (
                <p className="mt-1 font-mono text-[11px] text-[#b42318]" role="alert">
                  {errors.creatorCustomAddress}
                </p>
              ) : null}
            </div>
          ) : null}

          {errors.creatorMode ? (
            <p className="font-mono text-[11px] text-[#b42318]" role="alert">
              {errors.creatorMode}
            </p>
          ) : null}

          {isCreatorResolved(recipient) ? (
            <p className="font-mono text-[10px] text-[var(--muted-2)]" data-testid="creator-recipient-kind">
              {creatorRecipientLabel(recipient)}
            </p>
          ) : null}
        </section>

      <section aria-labelledby="dev-buy-heading" className="space-y-2 border-t border-[var(--divider)] pt-4">
        <h3
          id="dev-buy-heading"
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
        >
          Dev buy · optional
        </h3>
        {ethQuote ? (
          <>
            <p className="text-sm text-[var(--muted)]">
              Optional initial ETH purchase in the same transaction (
              <span className="font-mono">launchAndBuy</span>). Tokens go to your
              connected wallet (the deployer). Leave empty or{' '}
              <span className="font-mono">0</span> to launch without a buy.
            </p>
            <div>
              <input
                id="dev-buy"
                inputMode="decimal"
                value={state.devBuyAmount}
                onChange={(e) => onPatch({ devBuyAmount: e.target.value })}
                placeholder="Amount (ETH) · optional"
                aria-label="Dev buy amount in ETH"
                data-testid="dev-buy-input"
                className="w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 font-mono text-[15px] tabular-nums outline-none placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]"
              />
              {errors.devBuyAmount ? (
                <p className="mt-1 font-mono text-[11px] text-[#b42318]" role="alert">
                  {errors.devBuyAmount}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]" data-testid="dev-buy-disabled">
            Initial buy is currently available for ETH pairs only.
            {state.quoteAsset
              ? ` Selected pair uses ${quoteLabel}.`
              : ' Choose an ETH market pair to enable an initial buy.'}
          </p>
        )}
      </section>
    </div>
  );
}
