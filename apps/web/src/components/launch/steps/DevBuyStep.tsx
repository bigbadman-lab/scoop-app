'use client';

import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';
import {
  DEV_SUPPLY_OPTIONS,
  devSupplyOption,
  isBurnDevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';
import {
  CREATOR_FEE_HELPER,
  CREATOR_FEE_OPTIONS,
} from '@/lib/launch/creator-fee';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
  onPatch: (patch: Partial<LaunchFormState>) => void;
  /** True after a launch tx exists — policy is then immutable. */
  policyLocked?: boolean;
};

/**
 * Gate 8D public Dev Buy step — ETH pair, mandatory buy, Dev Supply policy.
 */
export function DevBuyStep({ state, errors, onPatch, policyLocked = false }: Props) {
  const selected = devSupplyOption(state.devSupplyPolicy);
  const burn = isBurnDevSupplyPolicy(state.devSupplyPolicy);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dev buy</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Every launch buys tokens with ETH. Choose how the creator allocation is
          handled after launch.
        </p>
      </div>

      <fieldset className="space-y-2" disabled={policyLocked}>
        <legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Dev Supply
        </legend>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          role="radiogroup"
          aria-label="Dev Supply"
          data-testid="dev-supply-options"
        >
          {DEV_SUPPLY_OPTIONS.map((option) => {
            const active = state.devSupplyPolicy === option.id;
            return (
              <label
                key={option.id}
                className={[
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-2 text-center font-mono text-[11px] uppercase tracking-[0.08em]',
                  active
                    ? 'border-[var(--scoop-green)] bg-[var(--scoop-green)] text-white!'
                    : 'border-[var(--divider)] bg-[var(--bg-elevated)] text-[var(--fg)]',
                  policyLocked ? 'cursor-not-allowed opacity-70' : '',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="dev-supply-policy"
                  className="sr-only"
                  checked={active}
                  disabled={policyLocked}
                  data-testid={`dev-supply-${option.id}`}
                  onChange={() => onPatch({ devSupplyPolicy: option.id })}
                />
                {option.label}
              </label>
            );
          })}
        </div>
        <p className="text-[12px] text-[var(--muted)]" data-testid="dev-supply-helper">
          {selected.helper}
        </p>
        {burn ? (
          <p className="text-[12px] text-[var(--muted)]" data-testid="dev-supply-burn-warning">
            Permanent and irreversible.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2" disabled={policyLocked}>
        <legend className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Creator Fee
        </legend>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Creator Fee"
          data-testid="creator-fee-options"
        >
          {CREATOR_FEE_OPTIONS.map((option) => {
            const active = state.creatorFeeBps === option.bps;
            return (
              <label
                key={option.bps}
                className={[
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border px-2 text-center font-mono text-[12px]',
                  active
                    ? 'border-[var(--scoop-green)] bg-[var(--scoop-green)] text-white!'
                    : 'border-[var(--divider)] bg-[var(--bg-elevated)] text-[var(--fg)]',
                  policyLocked ? 'cursor-not-allowed opacity-70' : '',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="creator-fee"
                  className="sr-only"
                  checked={active}
                  disabled={policyLocked}
                  data-testid={`creator-fee-${option.bps}`}
                  onChange={() => onPatch({ creatorFeeBps: option.bps })}
                />
                {option.label}
              </label>
            );
          })}
        </div>
        <p className="text-[12px] text-[var(--muted)]" data-testid="creator-fee-helper">
          {CREATOR_FEE_HELPER}
        </p>
      </fieldset>

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
          <span className="block text-[12px] text-[var(--muted)]" data-testid="dev-buy-funding">
            {burn
              ? 'Required. Pays the initial buy on Pons LaunchAndBuy, plus the live launch fee and gas. HoodLock fee is not charged.'
              : 'Required. Pays the initial buy on Pons LaunchAndBuy, plus the live launch fee, HoodLock fee, and gas.'}
          </span>
        )}
      </label>
    </div>
  );
}
