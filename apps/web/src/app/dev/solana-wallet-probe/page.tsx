import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SolanaWalletProbeClient } from '@/components/dev/SolanaWalletProbeClient';
import { isScoopSolanaWalletProbeEnabled } from '@/lib/solana/wallet-probe';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dev Solana probe',
  description: 'Internal SCOOP Solana wallet + RPC development route.',
  path: '/dev/solana-wallet-probe',
  indexable: false,
});

/**
 * Gate B temporary probe — not in product navigation.
 * Requires NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE=1.
 */
export default function SolanaWalletProbePage() {
  if (!isScoopSolanaWalletProbeEnabled()) {
    notFound();
  }
  return <SolanaWalletProbeClient />;
}
