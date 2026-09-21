'use client';

import { truncateAddress } from '@/lib/format';
import type { RailCompatibility } from '@/lib/launch/rail-compatibility';
import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';

type Props = {
  state: LaunchFormState;
  errors?: FieldErrors;
  /** Global session compatibility for the Pump rail. */
  compatibility: RailCompatibility;
  solanaAddress?: string | null;
  onPatch: (patch: Partial<LaunchFormState>) => void;
};

/**
 * Pump step 2 — wallet status + optional SOL DEV BUY.
 * Sign-in / switch happens only via top-right Sign In (no local CTAs).
 */
export function PumpRouteStep({
  state,
  errors = {},
  compatibility,
  solanaAddress = null,
  onPatch,
}: Props) {
  const compatible =
    compatibility.status === 'compatible' && Boolean(solanaAddress);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Wallet & network</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Uses the wallet from the top-right Sign In. Optionally set a SOL DEV BUY
          for the creator&apos;s initial purchase in the same transaction.
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
          Solana wallet
        </p>
        {compatible && solanaAddress ? (
          <p
            className="font-mono text-[13px] text-[var(--fg)]"
            data-testid="pump-solana-address"
          >
            {truncateAddress(solanaAddress, 6, 4)}
          </p>
        ) : (
          <p
            className="text-sm text-[var(--muted)]"
            data-testid="launch-wallet-notice"
            role="status"
          >
            {compatibility.message}
          </p>
        )}
        {errors.wallet ? (
          <p className="text-xs text-[#b42318]" role="alert">
            {errors.wallet}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="pump-dev-buy"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]"
        >
          DEV BUY
        </label>
        <div className="flex items-center gap-2">
          <input
            id="pump-dev-buy"
            data-testid="pump-dev-buy-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={state.devBuyAmount}
            onChange={(e) => onPatch({ devBuyAmount: e.target.value })}
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)] px-3 font-mono text-[14px] text-[var(--fg)] outline-none focus:border-[var(--fg)]"
          />
          <span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">
            SOL
          </span>
        </div>
        <p className="text-[12px] text-[var(--muted)]" data-testid="pump-dev-buy-helper">
          Optional initial buy from the creator wallet.
        </p>
        {errors.devBuyAmount ? (
          <p className="text-xs text-[#b42318]" role="alert">
            {errors.devBuyAmount}
          </p>
        ) : null}
      </div>
    </div>
  );
}
