'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useWalletClient,
} from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import type { Address } from 'viem';
import { TokenImage } from '@/components/ui/TokenImage';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import { robinhoodTxUrl } from '@/lib/chain/explorer';
import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import { discoverClaimAssetsFromFeeLines } from '@/lib/claims/discover';
import {
  ClaimAccountChangedError,
  executeWalletCreatorClaim,
} from '@/lib/claims/execute-claim';
import { claimAssetKey, formatClaimAmount } from '@/lib/claims/format';
import {
  enrichTokenMetadataFromChain,
  readAuthoritativeClaimables,
} from '@/lib/claims/read-claimable';
import type { ClaimAsset, ClaimRowPhase } from '@/lib/claims/types';
import type { PublicAccountResponse } from '@/lib/account/load-account';

const REFRESH_MS = 20_000;

type RowState = {
  phase: ClaimRowPhase;
  error: string | null;
  lastTxHash: string | null;
  lastClaimedRaw: bigint | null;
};

const idleRow = (): RowState => ({
  phase: 'idle',
  error: null,
  lastTxHash: null,
  lastClaimedRaw: null,
});

export function CreatorClaimsLane({
  feeAssets,
  sessionOnly,
}: {
  feeAssets: PublicAccountResponse['fees']['creator']['assets'];
  sessionOnly: boolean;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const creatorPct = PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100;

  const discovered = useMemo(
    () => discoverClaimAssetsFromFeeLines(feeAssets),
    [feeAssets],
  );

  const [assets, setAssets] = useState<ClaimAsset[]>(discovered);
  const [balances, setBalances] = useState<Map<string, bigint>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const refreshGen = useRef(0);
  const liveAddressRef = useRef<Address | undefined>(address as Address | undefined);

  useEffect(() => {
    liveAddressRef.current = address as Address | undefined;
  }, [address]);

  useEffect(() => {
    setAssets(discovered);
  }, [discovered]);

  const refreshBalances = useCallback(async () => {
    if (!address || !isConnected || !publicClient) {
      setLoading(false);
      setBalances(new Map());
      return;
    }
    const gen = ++refreshGen.current;
    setLoading(true);
    setSectionError(null);
    try {
      let nextAssets = discovered;
      if (publicClient && discovered.some((a) => a.kind === 'token')) {
        nextAssets = await Promise.all(
          discovered.map(async (asset) => {
            if (asset.kind !== 'token') return asset;
            if (asset.symbol !== 'TOKEN' && asset.decimals > 0) return asset;
            return enrichTokenMetadataFromChain({ publicClient, asset });
          }),
        );
      }
      if (gen !== refreshGen.current) return;
      setAssets(nextAssets);

      const { walletCreatorId } = await import('@/lib/launch/creator-id');
      const creatorId = walletCreatorId(address);
      const map = await readAuthoritativeClaimables({
        publicClient,
        creatorId,
        assets: nextAssets,
      });
      if (gen !== refreshGen.current) return;
      setBalances(map);
    } catch (error) {
      if (gen !== refreshGen.current) return;
      setSectionError(
        error instanceof Error ? error.message : 'Could not load claimable balances',
      );
    } finally {
      if (gen === refreshGen.current) setLoading(false);
    }
  }, [address, discovered, isConnected, publicClient]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  useEffect(() => {
    if (!address || !isConnected) return;
    const id = window.setInterval(() => {
      void refreshBalances();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [address, isConnected, refreshBalances]);

  async function onClaim(asset: ClaimAsset) {
    const key = claimAssetKey(asset);
    if (!address || !isConnected) {
      open({ view: 'Connect' });
      return;
    }
    if (sessionOnly || !walletClient || !publicClient) {
      setRows((prev) => ({
        ...prev,
        [key]: {
          ...idleRow(),
          phase: 'error',
          error: sessionOnly
            ? 'Connect the session wallet to claim.'
            : 'Wallet client unavailable.',
        },
      }));
      return;
    }

    const captured = address as Address;
    const chainBal = balances.get(key) ?? BigInt(0);
    if (chainBal <= BigInt(0)) return;

    setRows((prev) => ({
      ...prev,
      [key]: { ...idleRow(), phase: 'simulating' },
    }));

    try {
      const result = await executeWalletCreatorClaim({
        publicClient,
        walletClient,
        capturedWallet: captured,
        getLiveAccount: () => liveAddressRef.current,
        asset,
        onPhase: (phase) => {
          setRows((prev) => ({
            ...prev,
            [key]: {
              ...(prev[key] ?? idleRow()),
              phase,
              error: null,
            },
          }));
        },
      });

      setRows((prev) => ({
        ...prev,
        [key]: {
          phase: 'success',
          error: null,
          lastTxHash: result.txHash,
          lastClaimedRaw: result.amountRaw,
        },
      }));
      await refreshBalances();
    } catch (error) {
      const message =
        error instanceof ClaimAccountChangedError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Claim failed';
      setRows((prev) => ({
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

  const shareLabel = `${creatorPct}% of trading fees`;

  if (!address || !isConnected) {
    return (
      <div className="space-y-2">
        <LaneHeader title="Creator" shareLabel={shareLabel} />
        <p className="text-[13px] text-[var(--muted)]">
          Connect the wallet that owns these creator rewards to claim.
        </p>
        <button
          type="button"
          onClick={() => open({ view: 'Connect' })}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-2 hover:underline"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (loading && assets.length === 0) {
    return (
      <div className="space-y-2">
        <LaneHeader title="Creator" shareLabel={shareLabel} />
        <p className="text-sm text-[var(--muted)]">Loading claimable balances…</p>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="space-y-2">
        <LaneHeader title="Creator" shareLabel={shareLabel} />
        <p className="text-sm text-[var(--muted)]">
          No creator rewards available to claim.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <LaneHeader title="Creator" shareLabel={shareLabel} />
        <button
          type="button"
          onClick={() => void refreshBalances()}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Refresh
        </button>
      </div>
      <p className="text-[13px] leading-snug text-[var(--muted)]">
        CreatorRewards escrow — claimable balances are read on-chain.
      </p>
      {sectionError ? (
        <p className="text-sm text-red-600">{sectionError}</p>
      ) : null}
      <ul className="divide-y divide-[var(--divider)]">
        {assets.map((asset) => {
          const key = claimAssetKey(asset);
          const chainRaw = balances.get(key) ?? BigInt(0);
          const row = rows[key] ?? idleRow();
          const busy =
            row.phase === 'simulating' ||
            row.phase === 'awaiting_wallet' ||
            row.phase === 'submitted' ||
            row.phase === 'confirming';
          const canClaim = chainRaw > BigInt(0) && !busy && !sessionOnly;
          const imageSrc = pickTokenImageSrc(
            asset.displayImageUrl ?? null,
            asset.imageUri ?? null,
          );

          return (
            <li key={key} className="flex items-center gap-3 py-3">
              <TokenImage
                src={imageSrc}
                alt={asset.symbol}
                size={32}
                className="h-8 w-8 shrink-0 rounded-[var(--radius-sm)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  {asset.kind === 'token' && asset.tokenPageUrl ? (
                    <Link href={asset.tokenPageUrl} className="hover:underline">
                      {asset.symbol}
                    </Link>
                  ) : (
                    asset.symbol
                  )}
                  <span className="ml-1.5 font-normal text-[var(--muted)]">
                    {asset.name}
                  </span>
                </p>
                <p className="font-mono text-sm">
                  {formatClaimAmount(chainRaw, asset.decimals)} {asset.symbol}
                </p>
                {(asset.creditedRaw || asset.claimedRaw) && (
                  <p className="font-mono text-[11px] text-[var(--muted)]">
                    credited{' '}
                    {asset.creditedRaw
                      ? formatClaimAmount(BigInt(asset.creditedRaw), asset.decimals)
                      : '—'}{' '}
                    · claimed{' '}
                    {asset.claimedRaw
                      ? formatClaimAmount(BigInt(asset.claimedRaw), asset.decimals)
                      : '—'}
                  </p>
                )}
                {row.phase === 'success' && row.lastClaimedRaw != null ? (
                  <p className="mt-1 text-[12px] text-[var(--muted)]">
                    Claimed {formatClaimAmount(row.lastClaimedRaw, asset.decimals)}{' '}
                    {asset.symbol}
                    {row.lastTxHash ? (
                      <>
                        {' · '}
                        <a
                          href={robinhoodTxUrl(row.lastTxHash)}
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
                {row.phase === 'error' && row.error ? (
                  <p className="mt-1 text-[12px] text-red-600">{row.error}</p>
                ) : null}
                {busy ? (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                    {row.phase.replace(/_/g, ' ')}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!canClaim}
                onClick={() => void onClaim(asset)}
                className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--divider)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Claim
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LaneHeader({
  title,
  shareLabel,
}: {
  title: string;
  shareLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
        {shareLabel}
      </p>
    </div>
  );
}
