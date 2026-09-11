import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Docs',
  description: 'SCOOP protocol notes — markets and news on Robinhood Chain (4663).',
  path: '/docs',
});

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Docs</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Protocol notes</h1>
      <p className="mt-4 text-[var(--muted)]">
        Documentation destination placeholder. Chain ID 4663 — Robinhood Chain.
      </p>
    </main>
  );
}
