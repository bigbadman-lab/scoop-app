'use client';

import { truncateAddress } from '@/lib/format';
import type { RailCompatibility } from '@/lib/launch/rail-compatibility';

type Props = {
  errors?: Partial<Record<string, string>>;
  /** Global session compatibility for the Pump rail. */
  compatibility: RailCompatibility;
  solanaAddress?: string | null;
  /** Opens the site-wide Sign In sheet. Does not start a launch-local connect. */
  onSignIn: () => void;
  /** Clears the global wallet session, then opens Sign In. */
  onSwitchWallet: () => void;
};

/**
 * Pump step 2 — shows the global wallet session.
 * Wallet connection happens only through top-right / shared Sign In.
 */
export function PumpRouteStep({
  errors = {},
  compatibility,
  solanaAddress = null,
  onSignIn,
  onSwitchWallet,
}: Props) {
  const compatible =
    compatibility.status === 'compatible' && Boolean(solanaAddress);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Wallet & network</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Uses the wallet from Sign In. This launch creates the coin on Pump.fun
          — no initial buy in this MVP.
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
            className="text-sm text-[var(--fg)]"
            data-testid="launch-wallet-notice"
            role="status"
          >
            {compatibility.message}
          </p>
        )}
        {compatibility.status === 'requires_sign_in' ? (
          <button
            type="button"
            data-testid="launch-global-sign-in"
            onClick={onSignIn}
            className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--fg)] bg-[var(--fg)] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--bg)]"
          >
            Sign in
          </button>
        ) : null}
        {compatibility.status === 'incompatible_namespace' ? (
          <button
            type="button"
            data-testid="launch-switch-wallet"
            onClick={onSwitchWallet}
            className="inline-flex min-h-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)]"
          >
            Sign out & switch wallet
          </button>
        ) : null}
        {errors.wallet ? (
          <p className="text-xs text-[#b42318]" role="alert">
            {errors.wallet}
          </p>
        ) : null}
      </div>

      <div
        className="rounded-[var(--radius-md)] border border-[var(--divider)] px-4 py-3 text-sm text-[var(--fg)]"
        data-testid="pump-create-only-note"
      >
        <p className="font-semibold">Create only</p>
        <p className="mt-1 text-[var(--muted)]">
          SCOOP will submit a Pump.fun create transaction. Buying tokens after
          create is not included in this release — you can buy on Pump.fun after
          the coin exists.
        </p>
      </div>
    </div>
  );
}
