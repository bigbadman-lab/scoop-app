import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { XIcon } from '@/components/ui/XIcon';
import { SCOOP_X_URL } from '@/lib/brand';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'About',
  description:
    'SCOOP turns news and market narratives into onchain markets. Launch on Solana via Pump.fun or Robinhood Chain via Pons.',
  path: '/about',
});

const PILLARS = [
  {
    label: 'Discover',
    copy: 'Focused news feeds that cut through noise.',
  },
  {
    label: 'Launch',
    copy: 'Turn stories into markets on Solana or Robinhood Chain.',
  },
  {
    label: 'Trade',
    copy: 'Trade on the execution rail you launched with.',
  },
] as const;

export default function AboutPage() {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--scoop-green)_10%,transparent)_0%,transparent_62%)]"
      />

      <div className="relative mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <SectionHeading>About</SectionHeading>

        <h1 className="mt-6 max-w-2xl font-serif text-4xl leading-[1.05] tracking-tight text-[var(--fg)] md:mt-8 md:text-5xl lg:text-6xl">
          Markets move on information. SCOOP turns that information into markets.
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-[var(--muted)] md:mt-8 md:text-lg md:leading-relaxed">
          SCOOP is a discovery and market-creation layer for{' '}
          <strong className="font-medium text-[var(--fg)]">news, narratives and tokens</strong>.
        </p>
      </div>

      <section className="relative border-y border-[var(--divider)]">
        <div className="mx-auto grid max-w-3xl divide-y divide-[var(--divider)] px-4 md:grid-cols-3 md:divide-x md:divide-y-0 md:px-8">
          {PILLARS.map((pillar) => (
            <div key={pillar.label} className="py-6 md:px-6 md:py-8 first:md:pl-0 last:md:pr-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
                {pillar.label}
              </p>
              <p className="mt-3 text-sm leading-snug text-[var(--muted)] md:text-[15px]">
                {pillar.copy}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="relative mx-auto max-w-3xl space-y-16 px-4 py-16 md:space-y-20 md:px-8 md:py-24">
        <section aria-labelledby="about-product">
          <h2 id="about-product" className="sr-only">
            Product
          </h2>
          <div className="max-w-2xl space-y-5 text-[15px] leading-relaxed text-[var(--muted)] md:text-base md:leading-relaxed">
            <p>
              We surface relevant market news through focused feeds, helping users cut through the
              noise and find the stories worth paying attention to. From there, SCOOP AI helps turn
              those stories and narratives into launch concepts.
            </p>
            <p>
              Users then choose an execution rail. Solana launches route through{' '}
              <strong className="font-medium text-[var(--fg)]">Pump.fun</strong>. Robinhood Chain
              launches route through <strong className="font-medium text-[var(--fg)]">Pons</strong>,
              with Uniswap v4 liquidity on that path.
            </p>
            <p>
              SCOOP owns discovery, news context, launch assistance and market UX — not a custom
              Solana AMM, and not a replacement for Pump.fun or Pons.
            </p>
            <p>
              Our goal is simple: bring{' '}
              <strong className="font-medium text-[var(--fg)]">
                news discovery, market creation and onchain trading
              </strong>{' '}
              into one experience across both rails.
            </p>
          </div>
        </section>

        <section aria-labelledby="about-strong-narratives" data-testid="about-strong-narratives">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Ecosystem
          </p>
          <h2
            id="about-strong-narratives"
            className="mt-3 max-w-xl font-serif text-3xl leading-[1.1] tracking-tight text-[var(--fg)] md:text-4xl"
          >
            Strong narratives should have an edge.
          </h2>
          <div className="mt-6 max-w-2xl space-y-5 text-[15px] leading-relaxed text-[var(--muted)] md:text-base md:leading-relaxed">
            <p>
              SCOOP is built around the idea that better markets start with better stories.
            </p>
            <p>
              Our AI scans new launches for strong lore, clear narratives and early market signals.
              The launches that stand out can receive strategic onchain buys funded by creator
              rewards earned by SCOOP&apos;s native token.
            </p>
            <p>
              That means value generated by the ecosystem can flow back into promising new markets
              — rewarding better launches, better storytelling and stronger ideas.
            </p>
            <p>
              The goal isn&apos;t to support everything equally. It&apos;s to identify the launches
              with the strongest narrative potential and put capital behind them.
            </p>
            <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              news → narrative → launch → AI evaluation → selective onchain buys → stronger
              ecosystem
            </p>
          </div>
        </section>

        <section aria-labelledby="about-team">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Team
          </p>
          <h2
            id="about-team"
            className="mt-3 max-w-xl font-serif text-3xl leading-[1.1] tracking-tight text-[var(--fg)] md:text-4xl"
          >
            Built from experience
          </h2>
          <div className="mt-6 max-w-2xl space-y-5 text-[15px] leading-relaxed text-[var(--muted)] md:text-base md:leading-relaxed">
            <p>
              SCOOP is being built by a team with{' '}
              <strong className="font-medium text-[var(--fg)]">
                20 years of experience in technology
              </strong>{' '}
              and{' '}
              <strong className="font-medium text-[var(--fg)]">6 years working in Web3</strong>.
            </p>
            <p>
              We&apos;ve watched crypto evolve from an experimental financial system into
              infrastructure capable of bringing entirely new kinds of markets onchain.
            </p>
            <p>Now stocks are moving onchain too — alongside Solana meme markets and news-driven launches.</p>
            <p>
              We believe the next opportunity sits where those worlds meet — combining traditional
              market information with the speed, openness and programmability of crypto.
            </p>
            <p>That&apos;s what we&apos;re building with SCOOP.</p>
          </div>
        </section>

        <p className="max-w-xl font-serif text-2xl leading-snug tracking-tight text-[var(--fg)] md:text-3xl md:leading-snug">
          Find the signal. Launch the market. Trade the tape.
        </p>

        <footer className="border-t border-[var(--divider)] pt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Company
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--fg)]">
            <strong className="font-medium">Scoop Tech Ltd</strong>
            <br />
            <span className="text-[var(--muted)]">United Kingdom</span>
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-[15px]">
            <a
              href="mailto:hi@scoop.fun"
              className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              hi@scoop.fun
            </a>
            <a
              href={SCOOP_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              <XIcon className="h-3.5 w-3.5" />
              @scoopterminal
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
