import type { Metadata } from 'next';
import { NewsFeed } from '@/components/news/NewsFeed';
import { loadPublicNewsFeed } from '@/lib/news/feed';
import { NEWS_PAGE_SIZE } from '@/lib/news/public';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Live stock news',
  description:
    'Live stock-news desk on SCOOP. Headlines from third-party sources — read the original story, launch markets on Robinhood Chain.',
  path: '/news',
});

export default async function NewsPage() {
  const [initial, quoteCatalogue] = await Promise.all([
    loadPublicNewsFeed({ limit: NEWS_PAGE_SIZE }),
    loadEnabledQuoteCatalogue().catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5 md:px-8 md:py-6 lg:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        News
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
        Live desk
      </h1>
      <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
        Syndicated market headlines. Stories open on the publisher site — SCOOP does not
        republish full articles.
      </p>

      <div className="mt-4">
        <NewsFeed initial={initial} quoteCatalogue={quoteCatalogue} />
      </div>
    </main>
  );
}
