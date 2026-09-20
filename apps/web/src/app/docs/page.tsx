import type { Metadata } from 'next';
import { ProtocolDocsMarkdown } from '@/components/docs/ProtocolDocsMarkdown';
import { ProtocolDocsNav } from '@/components/docs/ProtocolDocsNav';
import { SectionHeading } from '@/components/ui/SectionHeading';
import {
  extractProtocolDocsSections,
  loadProtocolDocsMarkdown,
} from '@/lib/docs/protocol-docs';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'SCOOP Docs',
  description:
    'SCOOP product and protocol docs — launch on Solana via Pump.fun or Robinhood Chain via Pons, plus Robinhood Uniswap v4 protocol reference.',
  path: '/docs',
});

export default function DocsPage() {
  const markdown = loadProtocolDocsMarkdown();
  const sections = extractProtocolDocsSections(markdown);

  return (
    <main className="relative overflow-x-clip" data-testid="protocol-docs-page">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[22rem] bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--scoop-green)_10%,transparent)_0%,transparent_62%)]"
      />

      <div className="relative mx-auto w-full min-w-0 max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <div className="max-w-3xl">
          <SectionHeading>Docs</SectionHeading>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Product + protocol
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)] md:text-[15px]">
            SCOOP is the discovery and market-creation layer. Execution rails:{' '}
            <strong className="font-medium text-[var(--fg)]">Solana → Pump.fun</strong> and{' '}
            <strong className="font-medium text-[var(--fg)]">Robinhood Chain → Pons</strong>.
            Sections below document the Robinhood protocol stack where it still applies.
          </p>
        </div>

        <div className="mt-10 grid min-w-0 gap-10 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-14">
          <ProtocolDocsNav sections={sections} />
          <article className="min-w-0 max-w-3xl">
            <ProtocolDocsMarkdown markdown={markdown} />
          </article>
        </div>
      </div>
    </main>
  );
}
