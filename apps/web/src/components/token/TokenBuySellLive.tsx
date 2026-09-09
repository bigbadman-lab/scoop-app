'use client';

import { useEffect, useState } from 'react';
import {
  formatUnits,
  parseUnits,
  type PublicClient,
} from 'viem';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { clearTradeCache } from '@/lib/token/fetch-trades';
import { erc20Abi } from '@/lib/trade/abis';
import {
  DEFAULT_SLIPPAGE_BPS,
  SCOOP_TRADE_ADDRESSES,
} from '@/lib/trade/constants';
import {
  approveTokenForUniversalRouter,
  hasSellApprovals,
  simulateAndExecuteV4Swap,
} from '@/lib/trade/execute';
import {
  isNativeCurrency,
  poolKeyFromIndexed,
  settleTakeCurrencies,
  zeroForOneForTrade,
  type TradeSideMode,
} from '@/lib/trade/pool-key';
import { quoteExactInViaSimulation } from '@/lib/trade/quote';
import { minimumAmountOut } from '@/lib/trade/slippage';

import type { TokenBuySellProps } from '@/components/token/TokenBuySell';

export type { TokenBuySellProps };

type UiPhase =
  | 'idle'
  | 'quoting'
  | 'quoted'
  | 'approval-needed'
  | 'approving'
  | 'confirming'
  | 'submitted'
  | 'success'
  | 'error';

const BUY_TONE = 'text-[var(--scoop-live)]';

function shortenError(message: string): string {
  if (/user rejected|denied|rejected the request/i.test(message)) {
    return 'Transaction rejected in wallet';
  }
  if (/insufficient/i.test(message)) return 'Insufficient balance';
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}

/**
 * Wagmi-backed trade UI — mount only under WalletRuntimeProviders.
 * Encoding ported from scoop-protocol ScoopFactory / SwapFork.
 * Never broadcasts without simulation; never fabricates quotes from spot×size.
 */
export function TokenBuySellLive({
  tokenAddress,
  symbol,
  tokenDecimals,
  quoteAsset,
  quoteSymbol,
  quoteDecimals = 18,
  currency0,
  currency1,
  poolFee,
  tickSpacing,
  hooks,
  onTradeConfirmed,
}: TokenBuySellProps) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const [mode, setMode] = useState<TradeSideMode>('buy');
  const [amountInput, setAmountInput] = useState('');
  const [slippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [phase, setPhase] = useState<UiPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [amountOut, setAmountOut] = useState<bigint | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [quoteBal, setQuoteBal] = useState<bigint | null>(null);
  const [tokenBal, setTokenBal] = useState<bigint | null>(null);
  const [approval, setApproval] = useState<{
    erc20Ok: boolean;
    permit2Ok: boolean;
    ready: boolean;
  } | null>(null);

  const poolKey = poolKeyFromIndexed({
    currency0,
    currency1,
    fee: poolFee,
    tickSpacing,
    hooks,
  });
  const quoteIsNative = isNativeCurrency(quoteAsset);
  const wrongChain = isConnected && chainId != null && chainId !== ROBINHOOD_CHAIN_ID;

  useEffect(() => {
    setAmountOut(null);
    setPhase('idle');
    setError(null);
    setTxHash(null);
    setApproval(null);
  }, [mode, tokenAddress]);

  useEffect(() => {
    if (!publicClient || !address || !poolKey) return;
    let cancelled = false;
    async function loadBalances() {
      try {
        const token = tokenAddress.toLowerCase() as `0x${string}`;
        const [tBal, qBal] = await Promise.all([
          publicClient!.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address!],
          }),
          quoteIsNative
            ? publicClient!.getBalance({ address: address! })
            : publicClient!.readContract({
                address: quoteAsset.toLowerCase() as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address!],
              }),
        ]);
        if (!cancelled) {
          setTokenBal(tBal);
          setQuoteBal(qBal);
        }
      } catch {
        if (!cancelled) {
          setTokenBal(null);
          setQuoteBal(null);
        }
      }
    }
    void loadBalances();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, tokenAddress, quoteAsset, quoteIsNative, poolKey, phase]);

  const inputDecimals = mode === 'buy' ? quoteDecimals : tokenDecimals;
  const outputSymbol = mode === 'buy' ? symbol : quoteSymbol;
  const inputSymbol = mode === 'buy' ? quoteSymbol : symbol;

  let amountIn: bigint | null = null;
  try {
    if (amountInput.trim()) {
      amountIn = parseUnits(amountInput.trim(), inputDecimals);
    }
  } catch {
    amountIn = null;
  }

  const minOut =
    amountOut != null ? minimumAmountOut(amountOut, slippageBps) : null;

  async function refreshApproval(client: PublicClient, amt: bigint) {
    if (mode !== 'sell' && quoteIsNative) {
      setApproval({ erc20Ok: true, permit2Ok: true, ready: true });
      return;
    }
    const tokenIn =
      mode === 'sell'
        ? (tokenAddress.toLowerCase() as `0x${string}`)
        : (quoteAsset.toLowerCase() as `0x${string}`);
    if (isNativeCurrency(tokenIn)) {
      setApproval({ erc20Ok: true, permit2Ok: true, ready: true });
      return;
    }
    const status = await hasSellApprovals({
      publicClient: client,
      token: tokenIn,
      owner: address!,
      amountIn: amt,
    });
    setApproval(status);
  }

  async function onQuote() {
    setError(null);
    setTxHash(null);
    if (!poolKey) {
      setError('Pool key unavailable for this market');
      setPhase('error');
      return;
    }
    if (!isConnected || !address) {
      setError('Connect an external wallet to trade');
      return;
    }
    if (wrongChain) {
      setError('Switch to Robinhood Chain to trade');
      return;
    }
    if (!publicClient || amountIn == null || amountIn <= BigInt(0)) {
      setError('Enter a valid amount');
      return;
    }
    const bal = mode === 'buy' ? quoteBal : tokenBal;
    if (bal != null && amountIn > bal) {
      setError('Insufficient balance');
      setPhase('error');
      return;
    }

    setPhase('quoting');
    try {
      const zeroForOne = zeroForOneForTrade({
        mode,
        poolKey,
        quoteAsset,
        tokenAddress,
      });
      const { settle } = settleTakeCurrencies({ poolKey, zeroForOne });
      const value = isNativeCurrency(settle) ? amountIn : BigInt(0);
      const quote = await quoteExactInViaSimulation({
        publicClient,
        account: address,
        poolKey,
        zeroForOne,
        amountIn,
        value,
      });
      setAmountOut(quote.amountOut);
      await refreshApproval(publicClient, amountIn);
      const needsApproval =
        mode === 'sell' || (!quoteIsNative && mode === 'buy');
      if (needsApproval) {
        const status = await hasSellApprovals({
          publicClient,
          token:
            mode === 'sell'
              ? (tokenAddress.toLowerCase() as `0x${string}`)
              : (quoteAsset.toLowerCase() as `0x${string}`),
          owner: address,
          amountIn,
        });
        setApproval(status);
        setPhase(status.ready ? 'quoted' : 'approval-needed');
      } else {
        setPhase('quoted');
      }
    } catch (e) {
      setAmountOut(null);
      setPhase('error');
      setError(shortenError(e instanceof Error ? e.message : 'Quote failed'));
    }
  }

  async function onApprove() {
    if (!walletClient || !publicClient || !address || amountIn == null) return;
    setPhase('approving');
    setError(null);
    try {
      const tokenIn =
        mode === 'sell'
          ? (tokenAddress.toLowerCase() as `0x${string}`)
          : (quoteAsset.toLowerCase() as `0x${string}`);
      const status = await hasSellApprovals({
        publicClient,
        token: tokenIn,
        owner: address,
        amountIn,
      });
      await approveTokenForUniversalRouter({
        walletClient,
        publicClient,
        account: address,
        token: tokenIn,
        needErc20: !status.erc20Ok,
        needPermit2: !status.permit2Ok,
      });
      await refreshApproval(publicClient, amountIn);
      setPhase('quoted');
    } catch (e) {
      setPhase('error');
      setError(shortenError(e instanceof Error ? e.message : 'Approval failed'));
    }
  }

  async function onTrade() {
    if (!walletClient || !publicClient || !address || !poolKey) return;
    if (amountIn == null || amountOut == null || minOut == null || minOut <= BigInt(0)) {
      setError('Quote required before trading');
      return;
    }
    setPhase('confirming');
    setError(null);
    try {
      const zeroForOne = zeroForOneForTrade({
        mode,
        poolKey,
        quoteAsset,
        tokenAddress,
      });
      setPhase('submitted');
      const result = await simulateAndExecuteV4Swap({
        walletClient,
        publicClient,
        account: address,
        poolKey,
        zeroForOne,
        amountIn,
        amountOutMinimum: minOut,
      });
      setTxHash(result.hash);
      if (!result.success) {
        setPhase('error');
        setError('Transaction failed on-chain');
        return;
      }
      setPhase('success');
      clearTradeCache();
      onTradeConfirmed?.();
    } catch (e) {
      setPhase('error');
      setError(shortenError(e instanceof Error ? e.message : 'Trade failed'));
    }
  }

  const canQuote =
    Boolean(poolKey) &&
    isConnected &&
    !wrongChain &&
    amountIn != null &&
    amountIn > BigInt(0) &&
    phase !== 'quoting' &&
    phase !== 'approving' &&
    phase !== 'confirming' &&
    phase !== 'submitted';

  const primaryDisabled =
    !canQuote && phase !== 'quoted' && phase !== 'approval-needed';

  return (
    <section
      className="min-w-0"
      aria-labelledby="token-buy-sell-heading"
      data-testid="token-buy-sell"
    >
      <h2
        id="token-buy-sell-heading"
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
      >
        Trade
      </h2>

      <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
        {!poolKey ? (
          <p className="font-mono text-[11px] text-[var(--muted)]" role="status">
            Trading unavailable — pool key incomplete
          </p>
        ) : null}

        <div className="flex gap-1" role="tablist" aria-label="Trade side">
          {(['buy', 'sell'] as const).map((side) => {
            const selected = mode === side;
            return (
              <button
                key={side}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`token-trade-mode-${side}`}
                onClick={() => setMode(side)}
                className={[
                  'flex-1 rounded-[var(--radius-sm)] py-2 font-mono text-[11px] uppercase tracking-[0.14em]',
                  selected
                    ? side === 'buy'
                      ? `bg-[color-mix(in_srgb,var(--scoop-live)_14%,transparent)] ${BUY_TONE}`
                      : 'bg-[rgba(196,76,58,0.12)] text-[#c44c3a]'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]',
                ].join(' ')}
              >
                {side}
              </button>
            );
          })}
        </div>

        <label className="mt-3 block">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
            {mode === 'buy' ? 'You pay' : 'You sell'}
          </span>
          <div className="mt-1 flex items-center gap-2 border-b border-[var(--divider)] pb-1">
            <input
              data-testid="token-trade-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amountInput}
              onChange={(e) => {
                setAmountInput(e.target.value);
                setAmountOut(null);
                setPhase('idle');
                setError(null);
              }}
              className="min-w-0 flex-1 bg-transparent font-mono text-[15px] text-[var(--fg)] outline-none placeholder:text-[var(--muted-2)]"
            />
            <span className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
              {inputSymbol}
            </span>
          </div>
        </label>

        <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--muted-2)]">
          <span>
            Balance{' '}
            {mode === 'buy'
              ? quoteBal != null
                ? formatUnits(quoteBal, quoteDecimals)
                : '—'
              : tokenBal != null
                ? formatUnits(tokenBal, tokenDecimals)
                : '—'}
          </span>
          {mode === 'sell' && tokenBal != null && tokenBal > BigInt(0) ? (
            <button
              type="button"
              className="uppercase tracking-[0.12em] hover:text-[var(--fg)]"
              onClick={() => {
                setAmountInput(formatUnits(tokenBal, tokenDecimals));
                setAmountOut(null);
                setPhase('idle');
              }}
            >
              Max
            </button>
          ) : null}
        </div>

        <dl className="mt-3 space-y-1.5 font-mono text-[11px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted-2)]">You receive</dt>
            <dd data-testid="token-trade-receive">
              {amountOut != null
                ? `${formatUnits(amountOut, mode === 'buy' ? tokenDecimals : quoteDecimals)} ${outputSymbol}`
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted-2)]">Minimum</dt>
            <dd data-testid="token-trade-minimum">
              {minOut != null
                ? `${formatUnits(minOut, mode === 'buy' ? tokenDecimals : quoteDecimals)} ${outputSymbol}`
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--muted-2)]">Slippage</dt>
            <dd data-testid="token-trade-slippage">{slippageBps / 100}%</dd>
          </div>
        </dl>

        <div className="mt-3 space-y-2">
          {!isConnected ? (
            <p className="font-mono text-[11px] text-[var(--muted)]" role="status">
              Connect an external wallet to trade
            </p>
          ) : null}

          {wrongChain ? (
            <button
              type="button"
              data-testid="token-trade-switch-chain"
              disabled={switching}
              onClick={() => void switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID })}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--divider)] py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] hover:border-[var(--fg)]"
            >
              Switch to Robinhood Chain
            </button>
          ) : null}

          {phase === 'approval-needed' ? (
            <button
              type="button"
              data-testid="token-trade-approve"
              onClick={() => void onApprove()}
              className="w-full rounded-[var(--radius-sm)] bg-[var(--fg)] py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--bg)]"
            >
              Approve {mode === 'sell' ? symbol : quoteSymbol}
            </button>
          ) : null}

          {(phase === 'idle' ||
            phase === 'error' ||
            phase === 'quoting' ||
            (phase === 'quoted' && amountOut == null)) &&
          isConnected &&
          !wrongChain ? (
            <button
              type="button"
              data-testid="token-trade-quote"
              disabled={!canQuote || primaryDisabled}
              onClick={() => void onQuote()}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--divider)] py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] enabled:hover:border-[var(--fg)] disabled:opacity-40"
            >
              {phase === 'quoting' ? 'Quoting…' : 'Get quote'}
            </button>
          ) : null}

          {(phase === 'quoted' || phase === 'confirming' || phase === 'submitted') &&
          amountOut != null &&
          isConnected &&
          !wrongChain ? (
            <button
              type="button"
              data-testid="token-trade-submit"
              disabled={
                phase === 'confirming' ||
                phase === 'submitted' ||
                !walletClient ||
                (approval != null && !approval.ready && mode === 'sell')
              }
              onClick={() => void onTrade()}
              className={[
                'w-full rounded-[var(--radius-sm)] py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--bg)] disabled:opacity-40',
                mode === 'buy' ? 'bg-[var(--scoop-live)]' : 'bg-[#c44c3a]',
              ].join(' ')}
            >
              {phase === 'confirming' || phase === 'submitted'
                ? 'Confirm in wallet…'
                : mode === 'buy'
                  ? `Buy ${symbol}`
                  : `Sell ${symbol}`}
            </button>
          ) : null}

          {phase === 'approving' ? (
            <p className="text-center font-mono text-[11px] text-[var(--muted)]">
              Confirm approval in wallet…
            </p>
          ) : null}

          {phase === 'success' && txHash ? (
            <p className="font-mono text-[11px] text-[var(--scoop-live)]" data-testid="token-trade-success">
              Confirmed ·{' '}
              <a
                href={robinhoodTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
              >
                View tx
              </a>
            </p>
          ) : null}

          {error ? (
            <p
              className="font-mono text-[11px] text-[#c44c3a]"
              role="alert"
              data-testid="token-trade-error"
            >
              {error}
            </p>
          ) : null}

          <p className="font-mono text-[9px] leading-relaxed text-[var(--muted-2)]">
            Router {SCOOP_TRADE_ADDRESSES.universalRouter.slice(0, 8)}… · slippage{' '}
            {slippageBps / 100}% · simulate before send
          </p>
        </div>
      </div>
    </section>
  );
}
