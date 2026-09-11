import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Support',
  description: 'SCOOP support — help and contact details for protocol users.',
  path: '/support',
});

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Support</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Support</h1>
      <p className="mt-4 text-[var(--muted)]">Support contact details will be published here.</p>
    </main>
  );
}
