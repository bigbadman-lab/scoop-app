'use client';

import { truncateAddress } from '@/lib/format';
import type { RailCompatibility } from '@/lib/launch/rail-compatibility';

type Props = {
  errors?: Partial<Record<string, string>>;
  /** Global session compatibility for the Pump rail. */
  compatibility: RailCompatibility;
  solanaAddress?: string | null;
};

/**
 * Pump step 2 — read-only global wallet status.
 * Sign-in / switch happens only via top-right Sign In (no local CTAs).
 */
export function PumpRouteStep({
  errors = {},
  compatibility,
  solanaAddress = null,
}: Props) {
  const compatible =
    compatibility.status === 'compatible' && Boolean(solanaAddress);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Wallet & network</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Uses the wallet from the top-right Sign In. This launch creates the
          coin on Pump.fun — no initial buy in this MVP.
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
