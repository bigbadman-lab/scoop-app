import type { Metadata } from 'next';
import { LaunchFlow } from '@/components/launch/LaunchFlow';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Launch',
  description: 'Launch a token market on SCOOP / Robinhood Chain.',
  path: '/launch',
  indexable: false,
});

async function loadCatalogueSafe() {
  try {
    return await loadEnabledQuoteCatalogue();
  } catch (error) {
    console.error('[launch] quote catalogue load failed:', error);
    return [];
  }
}

export default async function LaunchPage() {
  const catalogue = await loadCatalogueSafe();

  return (
    <main className="px-4 py-5 md:px-8 md:py-8 lg:px-10">
      <LaunchFlow catalogue={catalogue} />
    </main>
  );
}
