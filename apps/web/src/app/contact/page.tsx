import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contact SCOOP — channels and support paths for the protocol.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Contact</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Contact</h1>
      <p className="mt-4 text-[var(--muted)]">Contact channels will be listed here.</p>
    </main>
  );
}
