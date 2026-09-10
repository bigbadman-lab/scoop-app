import Image from 'next/image';
import { PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';

const MARKET_FEEDS_SRC = '/brand/marketfeeds.webp' as const;

const FEE_ROWS = [
  {
    pct: PROTOCOL_FEE_SPLIT.creatorRewardsBps / 100,
    label: 'Creator rewards',
  },
  {
    pct: PROTOCOL_FEE_SPLIT.deployerBps / 100,
    label: 'Deployer rewards',
  },
  {
    pct: PROTOCOL_FEE_SPLIT.buybackBps / 100,
    label: 'Protocol',
  },
  {
    pct: PROTOCOL_FEE_SPLIT.operationsBps / 100,
    label: 'Operations',
  },
] as const;

/**
 * Homepage economics module — fee split + marketfeeds artwork.
 * No protocol-token / buyback framing.
 */
export function ProtocolSection() {
  return (
    <section
      aria-labelledby="protocol-heading"
      className="bg-[var(--scoop-orange)] text-[var(--scoop-orange-contrast)]"
      data-testid="protocol-economics"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-14 md:px-8 md:py-20 lg:px-10 lg:py-24">
        <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12 lg:gap-16">
          <div className="md:col-span-5 lg:col-span-5">
            <p className="font-mono text-[12px] uppercase tracking-[0.2em]">
              SCOOP ECONOMICS
            </p>
            <h2
              id="protocol-heading"
              className="mt-5 max-w-xl font-serif text-4xl leading-[1.05] tracking-tight md:mt-6 md:text-5xl lg:text-6xl xl:text-7xl"
            >
              The market feeds the market.
            </h2>
            <p className="mt-6 max-w-md text-base leading-snug md:mt-8 md:text-lg md:leading-snug">
              Every trade generates fees. SCOOP puts them back into the ecosystem,
              rewarding creators, deployers and the protocol that powers the
              market.
            </p>

            <dl className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-5 md:mt-12">
              {FEE_ROWS.map((row) => (
                <div key={row.label}>
                  <dd className="font-mono text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">
                    {row.pct}%
                  </dd>
                  <dt className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]/75">
                    {row.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="md:col-span-7 lg:col-span-7">
            <div className="relative mx-auto aspect-square w-full max-w-[36rem] md:ml-auto md:max-w-none">
              <Image
                src={MARKET_FEEDS_SRC}
                alt="Artwork showing market activity feeding back into the protocol"
                width={1000}
                height={1000}
                sizes="(max-width: 768px) 92vw, (max-width: 1400px) 52vw, 720px"
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
