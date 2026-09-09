'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/trade/constants';

export type TokenBuySellProps = {
  tokenAddress: string;
  symbol: string;
  tokenDecimals: number;
  quoteAsset: string;
  quoteSymbol: string;
  quoteDecimals?: number;
  currency0: string | null;
  currency1: string | null;
  poolFee: number | null;
  tickSpacing: number | null;
  hooks: string | null;
  onTradeConfirmed?: () => void;
};

/**
 * Light trade entry — no AppKit/wagmi static imports.
 * Loads TokenBuySellLive only after WalletRuntimeProviders is ready.
 */
export function TokenBuySell(props: TokenBuySellProps) {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType<TokenBuySellProps> | null>(null);

  useEffect(() => {
    if (!configured) return;
    void ensureRuntime(null);
  }, [configured, ensureRuntime]);

  useEffect(() => {
    if (!runtimeReady) return;
    void import('@/components/token/TokenBuySellLive').then((mod) => {
      setLive(() => mod.TokenBuySellLive);
    });
  }, [runtimeReady]);

  if (!configured) {
    return (
      <section
        className="min-w-0"
        aria-labelledby="token-buy-sell-heading"
        data-testid="token-buy-sell"
        data-wallet-runtime="off"
      >
        <h2
          id="token-buy-sell-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
        >
          Trade
        </h2>
        <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
          <p className="font-mono text-[11px] text-[var(--muted)]" role="status">
            Wallet auth is not configured in this environment.
          </p>
        </div>
      </section>
    );
  }

  if (!runtimeReady || !Live) {
    const busy = activating || (runtimeReady && !Live);
    return (
      <section
        className="min-w-0"
        aria-labelledby="token-buy-sell-heading"
        data-testid="token-buy-sell"
        data-wallet-runtime={busy ? 'loading' : 'idle'}
      >
        <h2
          id="token-buy-sell-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
        >
          Trade
        </h2>
        <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
          <div className="flex gap-1" role="tablist" aria-label="Trade side">
            <button
              type="button"
              role="tab"
              aria-selected
              data-testid="token-trade-mode-buy"
              disabled
              className="flex-1 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--scoop-live)_14%,transparent)] py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-live)] opacity-70"
            >
              buy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              data-testid="token-trade-mode-sell"
              disabled
              className="flex-1 rounded-[var(--radius-sm)] py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] opacity-70"
            >
              sell
            </button>
          </div>

          <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted-2)]">Slippage</dt>
              <dd data-testid="token-trade-slippage">{DEFAULT_SLIPPAGE_BPS / 100}%</dd>
            </div>
          </dl>

          <div className="mt-3 space-y-2">
            <p className="font-mono text-[11px] text-[var(--muted)]" role="status">
              {busy
                ? 'Preparing wallet…'
                : 'Connect an external wallet to trade'}
            </p>
            {!busy ? (
              <button
                type="button"
                data-testid="token-trade-connect"
                onClick={() => {
                  void ensureRuntime('connect');
                }}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--divider)] py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] hover:border-[var(--fg)]"
              >
                Connect wallet
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return <Live {...props} />;
}
