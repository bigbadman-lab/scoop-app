import { NewsFeed } from '@/components/news/NewsFeed';
import { loadPublicNewsFeed } from '@/lib/news/feed';
import { NEWS_PAGE_SIZE } from '@/lib/news/public';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';

export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const [initial, quoteCatalogue] = await Promise.all([
    loadPublicNewsFeed({ limit: NEWS_PAGE_SIZE }),
    loadEnabledQuoteCatalogue().catch(() => []),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8 lg:px-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        News
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
        Live desk
      </h1>

      <div className="mt-6">
        <NewsFeed initial={initial} quoteCatalogue={quoteCatalogue} />
      </div>
    </main>
  );
}
