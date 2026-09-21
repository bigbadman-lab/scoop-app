'use client';

type NetworkId = 'solana' | 'rhc';

type Props = {
  network: NetworkId;
  className?: string;
};

const NETWORK: Record<
  NetworkId,
  { label: string; iconSrc: string; testId: string; title: string }
> = {
  solana: {
    label: 'SOLANA',
    iconSrc: '/brand/solana.svg',
    testId: 'network-badge-solana',
    title: 'Solana',
  },
  rhc: {
    label: 'RHC',
    iconSrc: '/brand/rh.svg',
    testId: 'network-badge-rhc',
    title: 'Robinhood Chain',
  },
};

/**
 * Compact chain/network identity — same badge family as QuoteAssetBadge
 * (height, padding, border, radius, icon size, mono label).
 */
export function NetworkBadge({ network, className = '' }: Props) {
  const meta = NETWORK[network];
  return (
    <span
      className={[
        'inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--divider)]',
        'bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-1.5 py-0.5',
        'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--fg)]',
        'shadow-[0_1px_2px_rgba(10,10,10,0.06)] backdrop-blur-[2px]',
        className,
      ].join(' ')}
      data-testid={meta.testId}
      title={meta.title}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
      <img
        src={meta.iconSrc}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

export function networkBadgeIdForToken(args: {
  chainId: number;
  marketSource: 'scoop' | 'pons_v2' | 'pump';
}): NetworkId | null {
  if (args.marketSource === 'pump' || args.chainId === 900001) return 'solana';
  if (args.chainId === 4663) return 'rhc';
  return null;
}
