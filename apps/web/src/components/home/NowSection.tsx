import { SectionHeading } from '@/components/ui/SectionHeading';
import { CtaLink } from '@/components/ui/CtaLink';
import { LiveDeskStrip } from '@/components/home/LiveDeskStrip';
import { HouseLeadHero } from '@/components/home/HouseLeadHero';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';
import { HOUSE_IMAGE_SET, SCOOP_HERO_SRC } from '@/lib/brand';
import type { LeadNewsResult } from '@/lib/news/load-home';
import { MarketActivityList } from '@/components/home/MarketActivityList';
import type { MarketActivityResult } from '@/lib/discovery/load-home';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  news: LeadNewsResult;
  activity: MarketActivityResult;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

export function NowSection({ news, activity, catalogue }: Props) {
  const article = news.article;

  return (
    <section aria-label="Now" className="border-b border-[var(--divider)]">
      <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-10 md:px-8 md:pt-5 md:pb-14 lg:px-10">
        <LiveDeskStrip />

        {/* Brand mark + Launch */}
        <div className="mb-5 flex flex-col gap-5 md:mb-6 md:flex-row md:items-center md:justify-between md:gap-10">
          <div className="min-w-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SCOOP_HERO_SRC}
              alt=""
              width={1000}
              height={200}
              className="block w-[55%] max-w-[280px] rounded-[var(--radius-editorial)] object-contain md:w-[42%] md:max-w-[360px]"
            />
            <p className="mt-0 max-w-[22rem] text-sm tracking-tight text-[var(--fg)] md:max-w-sm md:text-base lg:max-w-md lg:text-lg lg:leading-snug">
              Turn news into markets. Earn from every trade.
            </p>
            <div className="mt-5 md:hidden">
              <CtaLink href="/launch" variant="primary" className="w-full justify-center px-5">
                Launch
              </CtaLink>
            </div>
          </div>

          <div className="hidden shrink-0 md:block">
            <CtaLink href="/launch" variant="primary" className="px-6 text-[13px]">
              Launch
            </CtaLink>
          </div>
        </div>

        <div
          aria-hidden
          className="mb-10 hidden h-px w-[90%] bg-[var(--divider)] md:mb-12 md:block"
        />

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-8">
            <HouseLeadHero news={news} />
            {HOUSE_IMAGE_SET.length === 0 ? (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                Add /house/01–03 to enable rotating house imagery
              </p>
            ) : null}

            {news.status === 'ok' && article ? (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <LaunchAsTokenLink providerArticleId={article.providerArticleId} />
                {article.url ? (
                  <CtaLink href={article.url} external>
                    Read story ↗
                  </CtaLink>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-4">
            <SectionHeading className="mb-5">Market activity</SectionHeading>
            <MarketActivityList activity={activity} catalogue={catalogue} />
          </div>
        </div>
      </div>
    </section>
  );
}
