'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { type Address, zeroAddress } from 'viem';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { formatClaimAmount } from '@/lib/claims/format';
import {
  HolderRewardClaimAccountChangedError,
  HolderRewardClaimChainError,
  executeHolderRewardClaim,
} from '@/lib/holder-rewards/execute-claim';
import {
  enrichHolderRewardEntitlements,
  holderRewardRowKey,
  type HolderRewardEnrichedRow,
} from '@/lib/holder-rewards/read-state';
import type {
  HolderRewardClaimPhase,
  HolderRewardEntitlementDto,
  PublicHolderRewardsResponse,
} from '@/lib/holder-rewards/types';

const REFRESH_MS = 20_000;

type RowUi = {
  phase: HolderRewardClaimPhase;
  error: string | null;
  lastTxHash: string | null;
  lastClaimedRaw: bigint | null;
};

const idleRow = (): RowUi => ({
  phase: 'idle',
  error: null,
  lastTxHash: null,
  lastClaimedRaw: null,
});

function assetLabel(asset: Address): { symbol: string; decimals: number } {
  if (asset.toLowerCase() === zeroAddress) {
    return { symbol: 'ETH', decimals: 18 };
  }
  return {
    symbol: `${asset.slice(0, 6)}…${asset.slice(-4)}`,
    decimals: 18,
  };
}

export function HolderRewardsLane({
  sessionOnly,
  mayBroadcastOnChain,
}: {
  sessionOnly: boolean;
  mayBroadcastOnChain: boolean;
}) {
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [entitlements, setEntitlements] = useState<HolderRewardEntitlementDto[]>([]);
  const [rows, setRows] = useState<HolderRewardEnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [claimRows, setClaimRows] = useState<Record<string, RowUi>>({});
  const refreshGen = useRef(0);
  const liveAddressRef = useRef<Address | undefined>(address as Address | undefined);
  const liveChainRef = useRef<number | undefined>(chainId);

  useEffect(() => {
    liveAddressRef.current = address as Address | undefined;
  }, [address]);

  useEffect(() => {
    liveChainRef.current = chainId;
  }, [chainId]);

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current;
    setLoading(true);
    setSectionError(null);
    try {
      const res = await fetch('/api/account/holder-rewards', {
        credentials: 'include',
        cache: 'no-store',
      });
      const body = (await res.json()) as PublicHolderRewardsResponse & {
        error?: string;
      };
      if (gen !== refreshGen.current) return;

      if (!res.ok) {
        setEnabled(false);
        setEntitlements([]);
        setRows([]);
        setSectionError(body.error ?? 'Could not load holder rewards');
        return;
      }

      setEnabled(body.enabled);
      setEntitlements(body.entitlements);

      if (!body.enabled) {
        setRows([]);
        return;
      }

      if (!publicClient || body.entitlements.length === 0) {
        setRows([]);
        return;
      }

      const enriched = await enrichHolderRewardEntitlements({
        publicClient,
        entitlements: body.entitlements,
      });
      if (gen !== refreshGen.current) return;
      setRows(enriched);
    } catch (error) {
      if (gen !== refreshGen.current) return;
      setSectionError(
        error instanceof Error ? error.message : 'Could not load holder rewards',
      );
    } finally {
      if (gen === refreshGen.current) setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, refresh]);

  const wrongChain =
    isConnected && chainId != null && chainId !== ROBINHOOD_CHAIN_ID;

  async function onClaim(row: HolderRewardEnrichedRow) {
    const key = holderRewardRowKey(row.entitlement);
    if (!address || !isConnected) {
      open({ view: 'Connect' });
      return;
    }
    if (sessionOnly || !mayBroadcastOnChain) {
      setClaimRows((prev) => ({
        ...prev,
        [key]: {
          ...idleRow(),
          phase: 'error',
          error: sessionOnly
            ? 'Connect the session wallet to claim.'
            : 'Connect an external wallet to claim on-chain.',
        },
      }));
      return;
    }
    if (wrongChain) {
      setClaimRows((prev) => ({
        ...prev,
        [key]: {
          ...idleRow(),
          phase: 'error',
          error: 'Switch to Robinhood Chain to claim.',
        },
      }));
      return;
    }
    if (!walletClient || !publicClient) {
      setClaimRows((prev) => ({
        ...prev,
        [key]: {
          ...idleRow(),
          phase: 'error',
          error: 'Wallet client unavailable.',
        },
      }));
      return;
    }
    if (row.durableState !== 'claimable') return;

    const captured = address as Address;
    setClaimRows((prev) => ({
      ...prev,
      [key]: { ...idleRow(), phase: 'simulating' },
    }));

    try {
      const result = await executeHolderRewardClaim({
        publicClient,
        walletClient,
        entitlement: row.entitlement,
        capturedWallet: captured,
        getLiveAccount: () => liveAddressRef.current,
        getLiveChainId: () => liveChainRef.current,
        onPhase: (phase) => {
          setClaimRows((prev) => ({
            ...prev,
            [key]: {
              ...(prev[key] ?? idleRow()),
              phase,
              error: null,
            },
          }));
        },
      });

      setClaimRows((prev) => ({
        ...prev,
        [key]: {
          phase: 'success',
          error: null,
          lastTxHash: result.txHash,
          lastClaimedRaw: result.amountRaw,
        },
      }));
      await refresh();
    } catch (error) {
      const message =
        error instanceof HolderRewardClaimAccountChangedError ||
        error instanceof HolderRewardClaimChainError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Claim failed';
      setClaimRows((prev) => ({
        ...prev,
        [key]: {
          phase: 'error',
          error: message,
          lastTxHash: prev[key]?.lastTxHash ?? null,
          lastClaimedRaw: null,
        },
      }));
    }
  }

  // Feature gated off (pre-P5/P8 production): render nothing — keep /account quiet.
  if (enabled === false) {
    return null;
  }

  if (enabled === null && loading) {
    return null;
  }

  return (
    <section
      className="mt-10 space-y-4 border-t border-[var(--divider)] pt-6"
      data-testid="holder-rewards-section"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Holder Rewards</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            Rewards earned for holding launched tokens. Rewards stay in the asset
            earned by the market — no swaps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Refresh
        </button>
      </div>

      {wrongChain ? (
        <button
          type="button"
          disabled={switching}
          onClick={() => void switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID })}
          className="rounded-[var(--radius-sm)] border border-[var(--divider)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] hover:border-[var(--fg)]"
        >
          Switch to Robinhood Chain
        </button>
      ) : null}

      {!address || !isConnected ? (
        <div className="space-y-2">
          <p className="text-[13px] text-[var(--muted)]">
            Connect the wallet that holds these rewards to claim.
          </p>
          <button
            type="button"
            onClick={() => open({ view: 'Connect' })}
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-2 hover:underline"
          >
            Connect wallet
          </button>
        </div>
      ) : null}

      {sectionError ? (
        <p className="text-sm text-red-600" role="alert">
          {sectionError}
        </p>
      ) : null}

      {loading && entitlements.length === 0 && !sectionError ? (
        <p className="text-sm text-[var(--muted)]">Loading holder rewards…</p>
      ) : null}

      {!loading && enabled && entitlements.length === 0 && !sectionError ? (
        <p className="text-sm text-[var(--muted)]">No holder rewards yet.</p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--divider)]">
          {rows.map((row) => {
            const key = holderRewardRowKey(row.entitlement);
            const claim = claimRows[key] ?? idleRow();
            const { symbol, decimals } = assetLabel(row.entitlement.asset);
            const amount = BigInt(row.entitlement.entitlementRaw);
            const busy =
              claim.phase === 'simulating' ||
              claim.phase === 'awaiting_wallet' ||
              claim.phase === 'submitted' ||
              claim.phase === 'confirming';
            const canClaim =
              row.durableState === 'claimable' &&
              !busy &&
              !sessionOnly &&
              mayBroadcastOnChain &&
              !wrongChain &&
              Boolean(address && isConnected);

            const statusLabel =
              row.durableState === 'paid'
                ? 'Paid'
                : row.durableState === 'claimable'
                  ? 'Claimable'
                  : row.durableState === 'pending'
                    ? 'Pending'
                    : row.durableState === 'unavailable'
                      ? 'Unavailable'
                      : 'Error';

            return (
              <li key={key} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight">
                    {symbol}
                    <span className="ml-1.5 font-normal text-[var(--muted)]">
                      Round {row.entitlement.roundId}
                    </span>
                  </p>
                  <p className="font-mono text-sm">
                    {formatClaimAmount(amount, decimals)} {symbol}
                  </p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    {statusLabel}
                  </p>
                  {claim.phase === 'success' && claim.lastClaimedRaw != null ? (
                    <p className="mt-1 text-[12px] text-[var(--muted)]" role="status">
                      Claim confirmed{' '}
                      {formatClaimAmount(claim.lastClaimedRaw, decimals)} {symbol}
                      {claim.lastTxHash ? (
                        <>
                          {' · '}
                          <a
                            href={robinhoodTxUrl(claim.lastTxHash)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-2 hover:underline"
                          >
                            Explorer
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {claim.phase === 'error' && claim.error ? (
                    <p className="mt-1 text-[12px] text-red-600">{claim.error}</p>
                  ) : null}
                  {row.durableState === 'unavailable' && row.reason ? (
                    <p className="mt-1 text-[12px] text-[var(--muted)]">{row.reason}</p>
                  ) : null}
                  {busy ? (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                      {claim.phase.replace(/_/g, ' ')}
                    </p>
                  ) : null}
                </div>
                {row.durableState === 'claimable' ? (
                  <button
                    type="button"
                    disabled={!canClaim}
                    onClick={() => void onClaim(row)}
                    className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--divider)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Claim
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
