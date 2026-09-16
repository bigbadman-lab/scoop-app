import type { Metadata } from 'next';
import { MarketsBoard } from '@/components/markets/MarketsBoard';
import { loadMarketsBoard } from '@/lib/markets/load-markets';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Markets',
  description:
    "Markets for what's happening now. Live SCOOP markets on Robinhood Chain.",
  path: '/markets',
});

export default async function MarketsPage() {
  const initial = await loadMarketsBoard();

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-6xl flex-col px-3 pt-3 pb-6 md:px-6 md:pt-4 md:pb-8">
      <h1 className="sr-only">Markets</h1>
      <MarketsBoard initial={initial} />
    </main>
  );
}
