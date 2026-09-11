import type { MetadataRoute } from 'next';
import { SCOOP_CHAIN_ID } from '@/lib/quotes/catalogue';
import {
  buildPublicSitemapEntries,
  loadSitemapTokenRows,
} from '@/lib/seo/build-sitemap';

/**
 * Public sitemap for https://scoop.fun.
 * Cached with ISR so newly launched tokens appear without a redeploy.
 * Token URLs are best-effort from indexed discovery; DB failures yield static routes only.
 *
 * Next.js requires a literal `revalidate` (imported identifiers are rejected).
 * Keep in sync with `SEO_SITEMAP_REVALIDATE_SECONDS` in `@/lib/seo/build-sitemap`.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tokens = await loadSitemapTokenRows(async () => {
    const { getTokens, serverDb } = await import('@/lib/server/queries');
    const rows = await getTokens(serverDb(), {
      chainId: SCOOP_CHAIN_ID,
      filter: 'all',
      sort: 'newest',
      limit: 500,
      offset: 0,
    });
    return rows.map((token) => ({
      tokenAddress: token.tokenAddress,
      launchedAt: token.launchedAt ?? null,
    }));
  });

  return buildPublicSitemapEntries({ tokens });
}
