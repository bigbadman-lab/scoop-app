'use client';

import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';
import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
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
    description: 'Creator rewards go to the wallet currently connected to SCOOP.',
    supported: true,
  },
  {
    mode: 'custom',
    label: 'Another wallet',
    description: 'Send creator rewards (70%) to a different EVM address.',
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Configure how you participate economically
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Who receives creator rewards? Only supported recipient paths can proceed.
        </p>
      </div>

      <section aria-labelledby="creator-fee-heading" className="space-y-2.5">
        <div>
          <h3
            id="creator-fee-heading"
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
          >
            Creator fee sharing · {PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100}%
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Trading fees allocated to the creator rewards vault.
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
