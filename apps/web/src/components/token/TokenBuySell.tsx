'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { DEFAULT_SLIPPAGE_BPS } from '@/lib/trade/constants';
import {
  canUseScoopUv4TradePath,
  PONS_TRADE_DISABLED_COPY,
  PUMP_TRADE_EXTERNAL_COPY,
} from '@/lib/trade/market-source-guard';

export type TokenBuySellProps = {
  tokenAddress: string;
  symbol: string;
  tokenDecimals: number;
  quoteAsset: string;
  quoteSymbol: string;
  quoteDecimals?: number;
  marketSource?: 'scoop' | 'pons_v2' | 'pump';
  marketPhase?: 'curve' | 'graduated_pool' | null;
  currency0: string | null;
  currency1: string | null;
  poolFee: number | null;
  tickSpacing: number | null;
  hooks: string | null;
  onTradeConfirmed?: () => void;
  /** Pump.fun coin URL — shown when marketSource === 'pump'. */
  pumpTradeUrl?: string | null;
};

/**
 * Light trade entry — no AppKit/wagmi static imports.
 * Loads TokenBuySellLive only after WalletRuntimeProviders is ready.
 * Gate 6: Pons curve markets never load Scoop UV4 swap UI.
 */
export function TokenBuySell(props: TokenBuySellProps) {
  const { configured, runtimeReady, activating, ensureRuntime } = useWalletShell();
  const [Live, setLive] = useState<ComponentType<TokenBuySellProps> | null>(null);

  const scoopTradeAllowed = canUseScoopUv4TradePath({
    marketSource: props.marketSource,
    marketPhase: props.marketPhase,
    currency0: props.currency0,
    currency1: props.currency1,
    poolFee: props.poolFee,
    tickSpacing: props.tickSpacing,
    hooks: props.hooks,
  });

  useEffect(() => {
    if (!configured || !scoopTradeAllowed) return;
    void ensureRuntime(null);
  }, [configured, ensureRuntime, scoopTradeAllowed]);

  useEffect(() => {
    if (!runtimeReady || !scoopTradeAllowed) return;
    void import('@/components/token/TokenBuySellLive').then((mod) => {
      setLive(() => mod.TokenBuySellLive);
    });
  }, [runtimeReady, scoopTradeAllowed]);

  if (!scoopTradeAllowed) {
    const isPump = props.marketSource === 'pump';
    return (
      <section
        className="min-w-0"
        aria-labelledby="token-buy-sell-heading"
        data-testid="token-buy-sell"
        data-trade-path={isPump ? 'external-pump' : 'disabled'}
        data-market-source={props.marketSource ?? 'scoop'}
      >
        <h2
          id="token-buy-sell-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
        >
          Trade
        </h2>
        <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
          {isPump && props.pumpTradeUrl ? (
            <>
              <p
                className="font-mono text-[11px] text-[var(--muted)]"
                role="status"
                data-testid="token-trade-disabled"
              >
                {PUMP_TRADE_EXTERNAL_COPY}
              </p>
              <a
                href={props.pumpTradeUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-green)] px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-white!"
                data-testid="token-trade-pump-link"
              >
                Trade on Pump.fun →
              </a>
            </>
          ) : (
            <p
              className="font-mono text-[11px] text-[var(--muted)]"
              role="status"
              data-testid="token-trade-disabled"
            >
              {props.marketSource === 'pons_v2'
                ? PONS_TRADE_DISABLED_COPY
                : 'Trading is unavailable for this market.'}
            </p>
          )}
        </div>
      </section>
    );
  }

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
