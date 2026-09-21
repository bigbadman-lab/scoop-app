'use client';

import { useAppKit } from '@reown/appkit/react';
import { useAppKitAccount } from '@reown/appkit/react';
import { truncateAddress } from '@/lib/format';
import { requestScoopConnect } from '@/lib/auth/open-scoop-auth';

type Props = {
  errors?: Partial<Record<string, string>>;
};

/**
 * Pump step 2 — Solana wallet + CREATE ONLY note (no initial buy in MVP).
 * Connect opens Solana-namespaced SCOOP headless sheet (or AppKit solana modal).
 */
export function PumpRouteStep({ errors = {} }: Props) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount({ namespace: 'solana' });

  function connectSolanaWallet() {
    requestScoopConnect(
      () => void open({ view: 'Connect', namespace: 'solana' }),
      { namespace: 'solana' },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Wallet & network</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Connect a Solana wallet. This launch creates the coin on Pump.fun — no
          initial buy in this MVP.
        </p>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Solana wallet
            </p>
            {isConnected && address ? (
              <p
                className="mt-1 font-mono text-[13px] text-[var(--fg)]"
                data-testid="pump-solana-address"
              >
                {truncateAddress(address, 6, 4)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--muted)]">Not connected</p>
            )}
          </div>
          <button
            type="button"
            data-testid="pump-connect-solana"
            onClick={connectSolanaWallet}
            className="shrink-0 min-h-9 rounded-[var(--radius-md)] border border-[var(--fg)] bg-[var(--fg)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--bg)]"
          >
            {isConnected ? 'Switch wallet' : 'Connect Solana'}
          </button>
        </div>
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
