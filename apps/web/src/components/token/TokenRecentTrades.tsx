'use client';

import { useEffect, useState } from 'react';
import type { TradeItem } from '@scoop/db';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { useTokenMarketLiveOptional } from '@/components/token/TokenMarketLiveProvider';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { clearTradeCache, fetchTokenTrades } from '@/lib/token/fetch-trades';
import {
  RECENT_TRADES_FETCH_LIMIT,
  RECENT_TRADES_VISIBLE_CAP,
  boundRecentTrades,
  formatTradeAbsoluteTime,
  formatTradeAge,
  formatTradeAccountDisplay,
  formatTradeExecutionPrice,
  formatTradeQuoteAmount,
  formatTradeSideLabel,
  formatTradeTokenAmount,
  formatTradeUsdValue,
  resolveTradeAccount,
  tradeIdentity,
} from '@/lib/token/recent-trades';

type Props = {
  tokenAddress: string;
  quoteSymbol: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: TradeItem[] };

const BUY_COLOR = 'text-[var(--scoop-live)]';
const SELL_COLOR = 'text-[#c44c3a]';

/**
 * Recent Trades beneath PRICE — newest-first indexed executions.
 * Consumes the shared token live layer when present (no separate poll).
 */
export function TokenRecentTrades({ tokenAddress, quoteSymbol }: Props) {
  const live = useTokenMarketLiveOptional();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [retryKey, setRetryKey] = useState(0);

  // Shared live layer.
  useEffect(() => {
    if (!live) return;
    if (live.tradesStatus === 'loading') {
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
      return;
    }
    if (live.tradesStatus === 'error') {
      setState((prev) =>
        prev.status === 'ready'
          ? prev
          : { status: 'error', message: live.tradesError ?? 'Trades unavailable' },
      );
      return;
    }
    if (live.tradesStatus === 'empty' || live.recentTrades.length === 0) {
      setState({ status: 'empty' });
      return;
    }
    setState({ status: 'ready', items: live.recentTrades });
    setNowSec(Math.floor(Date.now() / 1000));
  }, [live, live?.recentTrades, live?.tradesStatus, live?.tradesError]);

  // Fallback fetch outside provider (tests / isolated mounts).
  useEffect(() => {
    if (live) return;
    const ac = new AbortController();
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      const result = await fetchTokenTrades({
        tokenAddress,
        limit: RECENT_TRADES_FETCH_LIMIT,
        signal: ac.signal,
        bypassCache: retryKey > 0,
      });
      if (cancelled || ac.signal.aborted) return;

      if (!result.ok) {
        if (result.error === 'aborted') return;
        setState({ status: 'error', message: result.error });
        return;
      }

      const items = boundRecentTrades(result.items, RECENT_TRADES_VISIBLE_CAP);
      if (items.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({ status: 'ready', items });
      setNowSec(Math.floor(Date.now() / 1000));
    }

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [live, tokenAddress, retryKey]);

  function retry() {
    if (live) {
      live.refreshNow();
      return;
    }
    clearTradeCache();
    setRetryKey((k) => k + 1);
  }

  return (
    <section
      className="min-w-0"
      aria-labelledby="token-recent-trades-heading"
      data-testid="token-recent-trades"
    >
      <h2
        id="token-recent-trades-heading"
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
        data-testid="token-recent-trades-title"
      >
        Recent Trades
      </h2>

      <div
        className="mt-1.5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)]"
        data-testid="token-recent-trades-frame"
      >
        {state.status === 'loading' ? (
          <p
            className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]"
            data-testid="token-recent-trades-loading"
          >
            Loading trades
          </p>
        ) : null}

        {state.status === 'empty' ? (
          <p
            className="px-3 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
            data-testid="token-recent-trades-empty"
            role="status"
          >
            No trades yet
          </p>
        ) : null}

        {state.status === 'error' ? (
          <div
            className="flex flex-col items-center gap-2 px-3 py-8"
            data-testid="token-recent-trades-error"
            role="alert"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Trades unavailable
            </p>
            <button
              type="button"
              onClick={retry}
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-2 hover:underline"
              data-testid="token-recent-trades-retry"
            >
              Retry
            </button>
          </div>
        ) : null}

        {state.status === 'ready' ? (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-0 border-collapse text-left"
              data-testid="token-recent-trades-table"
            >
              <thead>
                <tr className="border-b border-[var(--divider)] font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                  <th className="hidden px-3 py-2 font-normal sm:table-cell">Account</th>
                  <th className="px-3 py-2 font-normal">Type</th>
                  <th className="px-3 py-2 font-normal">Price</th>
                  <th className="hidden px-3 py-2 font-normal md:table-cell">Token</th>
                  <th className="hidden px-3 py-2 font-normal lg:table-cell">Quote</th>
                  <th className="px-3 py-2 font-normal">USD</th>
                  <th className="px-3 py-2 font-normal">Time</th>
                  <th className="px-3 py-2 font-normal">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--divider)]">
                {state.items.map((trade) => {
                  const account = resolveTradeAccount(trade);
                  const side = formatTradeSideLabel(String(trade.side));
                  const sideTone =
                    side === 'BUY' ? BUY_COLOR : side === 'SELL' ? SELL_COLOR : 'text-[var(--muted)]';
                  const age = formatTradeAge(trade.blockTimestamp, nowSec);
                  const absolute = formatTradeAbsoluteTime(trade.blockTimestamp);
                  const txUrl = robinhoodTxUrl(trade.txHash);
                  const id = tradeIdentity(trade);

                  return (
                    <tr
                      key={id}
                      className="font-mono text-[11px] text-[var(--fg)]"
                      data-testid="token-recent-trade-row"
                      data-trade-id={id}
                      data-side={side}
                    >
                      <td className="hidden max-w-[9rem] px-3 py-2 align-middle sm:table-cell">
                        {account ? (
                          <ContractCopy
                            address={account}
                            className="min-h-0 py-0 text-[11px]"
                          />
                        ) : (
                          <span className="text-[var(--muted-2)]">
                            {formatTradeAccountDisplay(null)}
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 align-middle font-medium ${sideTone}`}>
                        <span data-testid="token-recent-trade-side">{side}</span>
                      </td>
                      <td
                        className="px-3 py-2 align-middle tabular-nums"
                        data-testid="token-recent-trade-price"
                      >
                        {formatTradeExecutionPrice(trade, quoteSymbol)}
                      </td>
                      <td
                        className="hidden px-3 py-2 align-middle tabular-nums text-[var(--muted)] md:table-cell"
                        data-testid="token-recent-trade-token-amt"
                      >
                        {formatTradeTokenAmount(trade)}
                      </td>
                      <td
                        className="hidden px-3 py-2 align-middle tabular-nums text-[var(--muted)] lg:table-cell"
                        data-testid="token-recent-trade-quote-amt"
                      >
                        {formatTradeQuoteAmount(trade, quoteSymbol)}
                      </td>
                      <td
                        className="px-3 py-2 align-middle tabular-nums"
                        data-testid="token-recent-trade-usd"
                      >
                        {formatTradeUsdValue(trade)}
                      </td>
                      <td
                        className="px-3 py-2 align-middle text-[var(--muted)]"
                        data-testid="token-recent-trade-time"
                        title={absolute || undefined}
                      >
                        {age}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <a
                          href={txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--muted)] underline-offset-2 hover:text-[var(--fg)] hover:underline"
                          aria-label={`View transaction ${trade.txHash} on explorer`}
                          data-testid="token-recent-trade-tx"
                        >
                          Tx
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
