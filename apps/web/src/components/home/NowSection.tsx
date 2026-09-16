import Link from 'next/link';
import { CtaLink } from '@/components/ui/CtaLink';
import { LiveDeskStrip } from '@/components/home/LiveDeskStrip';
import { HouseLeadHero } from '@/components/home/HouseLeadHero';
import { HomepageInfrastructureBadges } from '@/components/home/HomepageInfrastructureBadges';
import { HOUSE_IMAGE_SET, SCOOP_HERO_SRC } from '@/lib/brand';
import type { SpotPayload } from '@/lib/market/spot';
import type { LeadNewsResult } from '@/lib/news/load-home';

type Props = {
  news: LeadNewsResult;
  deskSpot: SpotPayload;
};

export function NowSection({ news, deskSpot }: Props) {
  return (
    <section aria-label="Now">
      <div className="mx-auto max-w-[1400px] px-4 pt-3 pb-2 md:px-8 md:pt-4 md:pb-2.5 lg:px-10">
        <LiveDeskStrip initialSpot={deskSpot} />

        {/* Brand mark + infrastructure badges + Launch */}
        <div className="mb-2.5 flex flex-col gap-3 md:mb-3 md:flex-row md:items-start md:justify-between md:gap-6 lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={SCOOP_HERO_SRC}
                alt="SCOOP"
                width={1000}
                height={200}
                className="block w-[55%] max-w-[280px] shrink-0 rounded-[var(--radius-editorial)] object-contain md:w-[42%] md:max-w-[360px]"
              />
              <HomepageInfrastructureBadges className="w-full min-w-0 lg:w-auto" />
            </div>
            <p className="mt-2.5 max-w-[22rem] text-sm tracking-tight text-[var(--fg)] md:mt-2 md:max-w-sm md:text-base lg:max-w-md lg:text-lg lg:leading-snug">
              Turn{' '}
              <Link href="/news" className="underline-offset-2 hover:underline">
                news
              </Link>{' '}
              into markets. Earn from every trade.
            </p>
            <div className="mt-4 md:hidden">
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
          className="mb-3.5 hidden h-px w-[90%] bg-[var(--divider)] md:mb-4 md:block"
        />

        <div>
          <HouseLeadHero news={news} />
          {HOUSE_IMAGE_SET.length === 0 ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
              Add a house image under /house and register it in HOUSE_IMAGE_SET
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
