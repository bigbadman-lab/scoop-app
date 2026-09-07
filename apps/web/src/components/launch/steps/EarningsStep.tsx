'use client';

import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';
import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import type { CreatorRecipientMode } from '@/lib/launch/types';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
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
    label: 'Connected wallet',
    description: 'Deferred — wallet connect is not wired in this app yet.',
    supported: false,
  },
  {
    mode: 'different',
    label: 'Different wallet',
    description: 'Send creator rewards (70%) to a specified EVM address.',
    supported: true,
  },
  {
    mode: 'x_handle',
    label: 'X handle',
    description: 'Deferred — on-chain X identity claim/resolution is not exposed yet.',
    supported: false,
  },
];

export function EarningsStep({ state, errors, onMode, onPatch }: Props) {
  const quoteLabel = state.quoteSymbol ?? 'QUOTE';

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Configure how you participate economically
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose where creator rewards go, and optionally buy at launch. Only
          supported recipient paths can proceed.
        </p>
      </div>

      {/* Creator fee sharing */}
      <section aria-labelledby="creator-fee-heading" className="space-y-2.5">
        <div>
          <h3
            id="creator-fee-heading"
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
          >
            Creator fee sharing · {PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100}%
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Trading fees allocated to the creator rewards vault, credited by{' '}
            <span className="font-mono">creatorId</span>.
          </p>
        </div>

        <div className="space-y-1.5" role="radiogroup" aria-label="Creator recipient">
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

        {state.creatorMode === 'different' ? (
          <div>
            <input
              id="creator-address"
              value={state.creatorAddress}
              onChange={(e) => onPatch({ creatorAddress: e.target.value.trim() })}
              spellCheck={false}
              autoComplete="off"
              placeholder="Recipient address · 0x…"
              aria-label="Recipient address"
              className="w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 font-mono text-[14px] outline-none placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]"
            />
            {errors.creatorAddress ? (
              <p className="mt-1 font-mono text-[11px] text-[#b42318]" role="alert">
                {errors.creatorAddress}
              </p>
            ) : null}
          </div>
        ) : null}

        {errors.creatorMode ? (
          <p className="font-mono text-[11px] text-[#b42318]" role="alert">
            {errors.creatorMode}
          </p>
        ) : null}
      </section>

      {/* Dev buy */}
      <section aria-labelledby="dev-buy-heading" className="space-y-2 border-t border-[var(--divider)] pt-4">
        <h3
          id="dev-buy-heading"
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]"
        >
          Dev buy · optional
        </h3>
        <p className="text-sm text-[var(--muted)]">
          Optional initial purchase in the same transaction as launch (
          <span className="font-mono">launchAndBuy</span>). Leave empty or{' '}
          <span className="font-mono">0</span> to launch without a buy. Amount is
          denominated in <span className="font-mono">{quoteLabel}</span> — never
          assumed to be ETH unless ETH is the selected quote.
        </p>
        <div>
          <input
            id="dev-buy"
            inputMode="decimal"
            value={state.devBuyAmount}
            onChange={(e) => onPatch({ devBuyAmount: e.target.value })}
            placeholder={`Amount (${quoteLabel}) · optional`}
            aria-label={`Dev buy amount in ${quoteLabel}`}
            className="w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 font-mono text-[15px] tabular-nums outline-none placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]"
          />
          {errors.devBuyAmount ? (
            <p className="mt-1 font-mono text-[11px] text-[#b42318]" role="alert">
              {errors.devBuyAmount}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
