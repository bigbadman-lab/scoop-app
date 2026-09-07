import { NewsFeed } from '@/components/news/NewsFeed';
import { loadPublicNewsFeed } from '@/lib/news/feed';
import { NEWS_PAGE_SIZE } from '@/lib/news/public';

export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const initial = await loadPublicNewsFeed({ limit: NEWS_PAGE_SIZE });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8 md:py-12 lg:px-10">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        News
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
        Live desk
      </h1>

      <div className="mt-10">
        <NewsFeed initial={initial} />
      </div>
    </main>
  );
}
