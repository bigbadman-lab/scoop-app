import Image from 'next/image';

const MARKET_FEEDS_SRC = '/brand/marketfeeds.webp' as const;

const FLYWHEEL_STEPS = [
  {
    label: 'Earn',
    copy: '$TAPE creator rewards accrue to the deployer wallet.',
  },
  {
    label: 'Scan',
    copy: 'AI scores launches for narrative strength, lore and early signals.',
  },
  {
    label: 'Buy',
    copy: 'Standout markets get real onchain purchases from that wallet.',
  },
  {
    label: 'Compound',
    copy: 'Stronger markets drive more activity — and more rewards to recycle.',
  },
] as const;

/**
 * Docs §24 visual — compact flywheel + marketfeeds art (homepage economics motif).
 */
export function CreatorRewardsFlywheel() {
  return (
    <aside
      aria-label="Creator rewards flywheel"
      className="my-8 overflow-hidden rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)]"
      data-testid="docs-creator-rewards-flywheel"
    >
      <div className="grid items-center gap-6 p-5 sm:p-6 md:grid-cols-12 md:gap-8 md:p-7">
        <div className="md:col-span-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
            The market feeds the market
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
            Creator rewards from <strong className="font-semibold text-[var(--fg)]">$TAPE</strong>{' '}
            fund selective onchain buys behind the strongest narratives — verified on Solana.
          </p>

          <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FLYWHEEL_STEPS.map((step, index) => (
              <li key={step.label} className="min-w-0" data-testid="docs-flywheel-step">
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="font-mono text-[11px] tabular-nums text-[var(--scoop-green)]"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)]">
                    {step.label}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-snug text-[var(--muted)]">{step.copy}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="md:col-span-5">
          <div className="relative mx-auto aspect-square w-full max-w-[16rem] md:max-w-none">
            <Image
              src={MARKET_FEEDS_SRC}
              alt="Artwork showing market activity feeding back into the protocol"
              width={640}
              height={640}
              sizes="(max-width: 768px) 16rem, 280px"
              className="h-auto w-full object-contain"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
