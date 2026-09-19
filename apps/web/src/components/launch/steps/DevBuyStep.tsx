'use client';

import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
  onPatch: (patch: Partial<LaunchFormState>) => void;
};

/**
 * Gate 7 public Dev Buy step — ETH pair fixed, mandatory non-zero buy,
 * 6-month HoodLock disclosure (no Scoop fee/quote catalogue).
 */
export function DevBuyStep({ state, errors, onPatch }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dev buy</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every launch buys tokens with ETH and locks the creator&apos;s allocation for 6
          months.
        </p>
      </div>

      <dl className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3 font-mono text-[12px]">
        <div className="flex justify-between gap-3 border-b border-[var(--divider)] py-2">
          <dt className="text-[var(--muted-2)]">Pair</dt>
          <dd data-testid="dev-buy-pair">ETH</dd>
        </div>
        <div className="flex justify-between gap-3 py-2">
          <dt className="text-[var(--muted-2)]">Dev tokens</dt>
          <dd data-testid="dev-buy-lock-note">Locked for 6 months after launch</dd>
        </div>
      </dl>

      <label className="block space-y-1.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Dev buy (ETH)
        </span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          data-testid="dev-buy-amount"
          value={state.devBuyAmount}
          onChange={(e) => onPatch({ devBuyAmount: e.target.value })}
          placeholder="0.05"
          className="w-full rounded-[var(--radius-sm)] border border-[var(--divider)] bg-[var(--bg)] px-3 py-2.5 font-mono text-[14px] text-[var(--fg)] outline-none focus:border-[var(--fg)]"
        />
        {errors.devBuyAmount ? (
          <span className="block text-[12px] text-red-600" role="alert">
            {errors.devBuyAmount}
          </span>
        ) : (
          <span className="block text-[12px] text-[var(--muted)]">
            Required. Pays the initial buy on Pons LaunchAndBuy (plus live launch fee &amp;
            gas).
          </span>
        )}
      </label>
    </div>
  );
}
