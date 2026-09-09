import { NowSection } from '@/components/home/NowSection';
import { DiscoverSection, DEFAULT_DISCOVER_TAB } from '@/components/home/DiscoverSection';
import { ProtocolSection } from '@/components/home/ProtocolSection';
import {
  loadDiscoverTab,
  type DiscoverTabResult,
} from '@/lib/discovery/load-home';
import { loadLeadNews } from '@/lib/news/load-home';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';
import { DISCOVER_TABS, type DiscoverTabId } from '@/lib/discovery/tabs';

export const dynamic = 'force-dynamic';

async function loadCatalogueSafe() {
  try {
    return await loadEnabledQuoteCatalogue();
  } catch (error) {
    console.error('[home] quote catalogue load failed:', error);
    return [];
  }
}

export default async function HomePage() {
  const [news, catalogue, ...tabResults] = await Promise.all([
    loadLeadNews(),
    loadCatalogueSafe(),
    ...DISCOVER_TABS.map((tab) => loadDiscoverTab(tab.id)),
  ]);

  const preloaded = Object.fromEntries(
    tabResults.map((result) => [result.tabId, result]),
  ) as Partial<Record<DiscoverTabId, DiscoverTabResult>>;

  const initialTab = DEFAULT_DISCOVER_TAB;
  const initialResult =
    preloaded[initialTab] ??
    ({
      tabId: initialTab,
      status: 'unavailable',
      items: [],
      message: 'Trending ranking is not available yet.',
    } satisfies DiscoverTabResult);

  return (
    <main>
      <NowSection news={news} />
      <DiscoverSection
        initialTab={initialTab}
        initialResult={initialResult}
        preloaded={preloaded}
        catalogue={catalogue}
      />
      <ProtocolSection />
    </main>
  );
}
