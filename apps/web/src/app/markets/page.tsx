import type { Metadata } from 'next';
import { MarketsBoard } from '@/components/markets/MarketsBoard';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { loadMarketsBoard } from '@/lib/markets/load-markets';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Markets',
  description:
    'Active SCOOP markets ranked by fully diluted valuation. Near-real-time FDV board on Robinhood Chain.',
  path: '/markets',
});

export default async function MarketsPage() {
  const initial = await loadMarketsBoard();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-14">
      <SectionHeading>Markets</SectionHeading>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Markets</h1>
      <p className="mt-2 max-w-xl text-[15px] text-[var(--muted)]">
        Active SCOOP markets ranked by fully diluted valuation.
      </p>
      <MarketsBoard initial={initial} />
    </main>
  );
}
