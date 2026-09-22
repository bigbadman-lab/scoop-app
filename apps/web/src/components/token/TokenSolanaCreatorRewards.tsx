'use client';

import Link from 'next/link';
import { useWalletShell } from '@/components/auth/WalletShellProvider';
import { walletIdentitiesEqual } from '@/lib/auth/address';
import { useScoopWalletSession } from '@/lib/auth/use-scoop-wallet-session';

type Props = {
  /** Pump creator wallet (stored as deployerAddress on Solana/Pump tokens). */
  creatorWallet: string;
};

type PanelProps = {
  isMatchingCreator: boolean;
};

/**
 * Presentational panel — no wallet hooks (safe without Wagmi/AppKit providers).
 */
function CreatorRewardsPanel({ isMatchingCreator }: PanelProps) {
  const ctaLabel = isMatchingCreator ? 'Claim creator fees →' : 'Claim via account →';

  return (
    <section
      className="min-w-0"
      aria-labelledby="token-solana-creator-rewards-heading"
      data-testid="token-solana-creator-rewards"
      data-creator-match={isMatchingCreator ? 'yes' : 'no'}
    >
      <h2
        id="token-solana-creator-rewards-heading"
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
      >
        Creator rewards
      </h2>
      <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
        <p
          className="font-mono text-[11px] leading-snug text-[var(--muted)]"
          data-testid="token-solana-creator-rewards-copy"
        >
          Creator fees from this market accrue to your Solana wallet. Claim them anytime from your
          SCOOP account.
        </p>
        <Link
          href="/account"
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-4 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] hover:border-[var(--fg)]"
          data-testid="token-solana-creator-rewards-cta"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}

/**
 * Only mounted when WalletShell has loaded Wagmi/AppKit providers.
 * Calling useScoopWalletSession without WagmiProvider throws and blanked mobile token pages.
 */
function TokenSolanaCreatorRewardsLive({ creatorWallet }: Props) {
  const session = useScoopWalletSession();
  const isMatchingCreator =
    session.authenticated &&
    session.authMethod === 'siws' &&
    session.namespace === 'solana' &&
    typeof session.address === 'string' &&
    walletIdentitiesEqual(session.address, creatorWallet);

  return <CreatorRewardsPanel isMatchingCreator={isMatchingCreator} />;
}

/**
 * Compact Solana/Pump creator-fee guidance. Claims stay on `/account`.
 * Defers wallet-session hooks until wallet runtime is ready (lazy shell).
 */
export function TokenSolanaCreatorRewards({ creatorWallet }: Props) {
  const { runtimeReady } = useWalletShell();

  if (!runtimeReady) {
    return <CreatorRewardsPanel isMatchingCreator={false} />;
  }

  return <TokenSolanaCreatorRewardsLive creatorWallet={creatorWallet} />;
}
