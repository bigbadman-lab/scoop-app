import { SectionHeading } from '@/components/ui/SectionHeading';
import { CtaLink } from '@/components/ui/CtaLink';
import { ImageFallback } from '@/components/ui/ImageFallback';
import { HOUSE_IMAGE_SET, SCOOP_HERO_SRC } from '@/lib/brand';
import { formatRelativeTime } from '@/lib/format';
import type { LeadNewsResult } from '@/lib/news/load-home';
import { MarketActivityList } from '@/components/home/MarketActivityList';
import type { MarketActivityResult } from '@/lib/discovery/load-home';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  news: LeadNewsResult;
  activity: MarketActivityResult;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

function houseImageSrc(): string | null {
  if (HOUSE_IMAGE_SET.length === 0) return null;
  const idx = Math.floor(Date.now() / 86_400_000) % HOUSE_IMAGE_SET.length;
  return HOUSE_IMAGE_SET[idx] ?? null;
}

export function NowSection({ news, activity, catalogue }: Props) {
  const houseSrc = houseImageSrc();
  const article = news.article;

  return (
    <section aria-label="Now" className="border-b border-[var(--divider)]">
      <div className="mx-auto max-w-[1400px] px-4 pt-6 pb-10 md:px-8 md:pt-8 md:pb-14 lg:px-10">
        {/* Main hero — sized at ~50% of content width */}
        <div className="mb-10 md:mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SCOOP_HERO_SRC}
            alt=""
            width={1000}
            height={400}
            className="block w-1/2 max-w-full rounded-[var(--radius-editorial)] object-contain"
          />
          <p className="mt-5 max-w-2xl text-lg font-semibold tracking-tight text-[var(--fg)] md:mt-6 md:text-xl lg:text-2xl lg:leading-snug">
            Turn the news into a market, choose what it trades against, and earn from
            every trade.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Lead — ~8 cols */}
          <div className="lg:col-span-8">
            {houseSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={houseSrc}
                alt=""
                className="w-full rounded-[var(--radius-editorial)] object-cover"
                style={{ aspectRatio: '1.5 / 1' }}
              />
            ) : (
              <ImageFallback variant="house" className="w-full" />
            )}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              House image · independent of article photography
            </p>

            <div className="mt-6 space-y-4">
              {news.status === 'ok' && article ? (
                <>
                  <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Just in · {formatRelativeTime(article.publishedAt)}
                  </p>
                  <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-[var(--fg)] md:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
                    {article.headline}
                  </h1>
                  <p className="font-mono text-[12px] text-[var(--muted)]">{article.sourceDomain}</p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <CtaLink href={article.url} external>
                      Read story →
                    </CtaLink>
                    {/* CREATE FROM STORY omitted — no public launch/auth flow yet */}
                  </div>
                </>
              ) : (
                <NewsUnavailable news={news} />
              )}
            </div>
          </div>

          {/* Market activity — ~4 cols */}
          <div className="lg:col-span-4">
            <SectionHeading className="mb-5">Market activity</SectionHeading>
            <MarketActivityList activity={activity} catalogue={catalogue} />
          </div>
        </div>
      </div>
    </section>
  );
}

function NewsUnavailable({ news }: { news: LeadNewsResult }) {
  const title =
    news.status === 'gated'
      ? 'Latest story pending'
      : news.status === 'empty'
        ? 'No stories yet'
        : 'Story unavailable';

  return (
    <div className="space-y-3">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Just in
      </p>
      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="max-w-md text-sm text-[var(--muted)]">
        {news.message ??
          'News will appear here when public display is enabled and articles are available.'}
      </p>
    </div>
  );
}
