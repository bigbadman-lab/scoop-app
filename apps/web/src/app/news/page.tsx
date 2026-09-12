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
      <NewsFeed initial={initial} quoteCatalogue={quoteCatalogue} />
    </main>
  );
}
