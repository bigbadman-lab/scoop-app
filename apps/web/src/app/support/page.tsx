import type { Metadata } from 'next';
import { SupportPageView } from '@/components/support/SupportPageView';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Support',
  description:
    'SCOOP support — help with wallets, launching, trading, fees, rewards, news and blockchain transactions.',
  path: '/support',
});

export default function SupportPage() {
  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 overflow-x-clip px-4 py-16 md:px-8">
      <SectionHeading>Support</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Support</h1>
      <SupportPageView />
    </main>
  );
}
