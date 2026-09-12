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
    <main className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-6xl flex-col px-4 pt-4 pb-8 md:px-8 md:pt-5 md:pb-10">
      <h1 className="sr-only">Markets</h1>
      <MarketsBoard initial={initial} />
    </main>
  );
}
