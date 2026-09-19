import type { Metadata } from 'next';
import Link from 'next/link';
import { ProtocolStatsLive } from '@/components/protocol/ProtocolStatsLive';
import { emptyProtocolStats, loadProtocolStatsSafe } from '@/lib/protocol/load-stats';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '$TAPE — SCOOP Protocol',
  description:
    '$TAPE is the official token of SCOOP. Track SCOOP protocol markets, trades, volume and fees in near real time.',
  path: '/protocol/tape',
  absoluteTitle: true,
});

export default async function TapeProtocolPage() {
  let initialStats = emptyProtocolStats();
  try {
    initialStats = await loadProtocolStatsSafe();
  } catch {
    initialStats = emptyProtocolStats();
  }

  return (
    <main className="relative overflow-hidden" data-testid="tape-protocol-page">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--scoop-green)_12%,transparent)_0%,transparent_65%)]"
      />

      <div className="relative mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-16 lg:px-10 lg:py-20">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Protocol
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-[0.95] tracking-tight text-[var(--fg)] md:text-6xl lg:text-7xl">
          $TAPE
        </h1>
        <p className="mt-3 font-serif text-2xl tracking-tight text-[var(--fg)] md:text-3xl">
          Trade the Tape.
        </p>
        <p className="mt-5 max-w-2xl text-base leading-snug text-[var(--muted)] md:text-lg">
          $TAPE is the official token of SCOOP — the protocol for turning market-moving
          stories into onchain markets.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-snug text-[var(--muted-2)] md:text-base">
          Follow the protocol as it grows: markets launched, trades, volume and fees —
          updated near real time from indexed Robinhood Chain data.
        </p>

        <ProtocolStatsLive initialStats={initialStats} />

        <section className="mt-14 max-w-2xl border-t border-[var(--divider)] pt-10 md:mt-16">
          <h2 className="font-serif text-xl tracking-tight text-[var(--fg)] md:text-2xl">
            Built for market culture
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] md:text-base">
            SCOOP markets run on Robinhood Chain with Uniswap v4 liquidity. Protocol
            trading fees route through the deployed fee distributor — including a
            protocol allocation reserved for buybacks. Stats above reflect indexed
            distributions marked to market in USD; they do not invent executed buy
            volume or uncollected LP fees.
          </p>
        </section>

        <section
          className="mt-14 max-w-2xl border-t border-[var(--divider)] pt-10 md:mt-16"
          aria-labelledby="tape-docs-cta-heading"
        >
          <h2
            id="tape-docs-cta-heading"
            className="font-serif text-xl tracking-tight text-[var(--fg)] md:text-2xl"
          >
            Want the full picture?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] md:text-base">
            Read the complete SCOOP documentation — protocol mechanics, launches, fees,
            rewards and more.
          </p>
          <Link
            href="/docs"
            className="mt-5 inline-flex min-h-11 items-center text-[14px] tracking-tight text-[var(--scoop-green)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            Read the docs →
          </Link>
        </section>
      </div>
    </main>
  );
}
