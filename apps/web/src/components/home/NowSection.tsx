import { CtaLink } from '@/components/ui/CtaLink';
import { LiveDeskStrip } from '@/components/home/LiveDeskStrip';
import { HouseLeadHero } from '@/components/home/HouseLeadHero';
import { HomepageInfrastructureBadges } from '@/components/home/HomepageInfrastructureBadges';
import { HOUSE_IMAGE_SET, SCOOP_HERO_SRC } from '@/lib/brand';
import type { LeadNewsResult } from '@/lib/news/load-home';

type Props = {
  news: LeadNewsResult;
};

export function NowSection({ news }: Props) {
  return (
    <section aria-label="Now">
      <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-2 md:px-8 md:pt-5 md:pb-3 lg:px-10">
        <LiveDeskStrip />

        {/* Brand mark + infrastructure badges + Launch */}
        <div className="mb-3 flex flex-col gap-4 md:mb-4 md:flex-row md:items-start md:justify-between md:gap-8 lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SCOOP_HERO_SRC}
                alt=""
                width={1000}
                height={200}
                className="block w-[55%] max-w-[280px] shrink-0 rounded-[var(--radius-editorial)] object-contain md:w-[42%] md:max-w-[360px]"
              />
              <HomepageInfrastructureBadges className="w-full min-w-0 lg:w-auto" />
            </div>
            <p className="mt-3 max-w-[22rem] text-sm tracking-tight text-[var(--fg)] md:mt-2 md:max-w-sm md:text-base lg:max-w-md lg:text-lg lg:leading-snug">
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
          className="mb-5 hidden h-px w-[90%] bg-[var(--divider)] md:mb-6 md:block"
        />

        <div>
          <HouseLeadHero news={news} />
          {HOUSE_IMAGE_SET.length === 0 ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Add /house/01–03 to enable rotating house imagery
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
