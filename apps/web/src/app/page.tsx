import type { Metadata } from 'next';
import { NowSection } from '@/components/home/NowSection';
import { DiscoverSection, DEFAULT_DISCOVER_TAB } from '@/components/home/DiscoverSection';
import { ProtocolSection } from '@/components/home/ProtocolSection';
import { loadDiscoverSnapshot } from '@/lib/discovery/load-home';
import { loadLeadNews } from '@/lib/news/load-home';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { buildHomeJsonLd, JsonLdScript } from '@/lib/seo/json-ld';
import { buildPageMetadata, SEO_DEFAULT_DESCRIPTION } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'SCOOP',
  description: SEO_DEFAULT_DESCRIPTION,
  path: '/',
  absoluteTitle: true,
});

async function loadCatalogueSafe() {
  try {
    return await loadEnabledQuoteCatalogue();
  } catch (error) {
    console.error('[home] quote catalogue load failed:', error);
    return [];
  }
}

export default async function HomePage() {
  const [news, catalogue, discover] = await Promise.all([
    loadLeadNews(),
    loadCatalogueSafe(),
    loadDiscoverSnapshot(),
  ]);

  return (
    <main>
      <JsonLdScript data={buildHomeJsonLd()} />
      <NowSection news={news} />
      <DiscoverSection
        initialTab={DEFAULT_DISCOVER_TAB}
        initialSnapshot={discover}
        catalogue={catalogue}
      />
      <ProtocolSection />
    </main>
  );
}
