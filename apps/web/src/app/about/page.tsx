import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'About',
  description:
    'SCOOP is a live financial publication and market application on Robinhood Chain.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>About</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">About SCOOP</h1>
      <p className="mt-4 text-[var(--muted)]">
        SCOOP is a live financial publication and market application on Robinhood Chain.
      </p>
    </main>
  );
}
