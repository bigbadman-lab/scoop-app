'use client';

import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import type { PublicAccountResponse } from '@/lib/account/load-account';

type DeployerAsset = PublicAccountResponse['fees']['deployer']['assets'][number];

/**
 * Deployer fee lane — automatic payout model (no claim CTA).
 * Amounts are lifetime totals from indexed fee_distributions.deployer_raw.
 */
export function DeployerFeesLane({ assets }: { assets: DeployerAsset[] }) {
  const deployerPct = PROTOCOL_FEE_SPLIT.deployerBps / 100;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[15px] font-semibold tracking-tight">Deployer fees</h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {deployerPct}% of gross trading fees
        </p>
      </div>

      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
        Paid automatically
      </p>

      <p className="text-[13px] leading-snug text-[var(--muted)]">
        Rewards are sent directly to the deployer wallet whenever protocol fees
        are distributed.
      </p>

      {assets.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No deployer fees earned yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--divider)]">
          {assets.map((asset) => (
            <li
              key={`${asset.assetKind}:${asset.assetAddress}`}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">
                {asset.symbol}
              </p>
              <p className="text-right text-sm">
                <span className="font-mono">
                  {asset.amountDisplay} {asset.symbol}
                </span>
                <span className="ml-1.5 text-[12px] text-[var(--muted)]">earned</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
