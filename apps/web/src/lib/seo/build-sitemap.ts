import type { MetadataRoute } from 'next';
import { absoluteSeoUrl } from '@/lib/seo/site';

/** ISR interval for `/sitemap.xml` — new token URLs appear without redeploy. */
export const SEO_SITEMAP_REVALIDATE_SECONDS = 3600;

export const SEO_SITEMAP_STATIC_PATHS = [
  '/',
  '/news',
  '/about',
  '/contact',
  '/docs',
  '/support',
  '/legal/terms',
  '/legal/privacy',
  '/legal/risk',
  '/legal/disclaimer',
] as const;

export type SitemapTokenRow = {
  tokenAddress: string;
  launchedAt: number | null;
};

/**
 * Assemble the public sitemap.
 * Token rows are optional — DB/query failures must leave static entries intact.
 */
export function buildPublicSitemapEntries(input: {
  tokens?: readonly SitemapTokenRow[] | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): MetadataRoute.Sitemap {
  const now = input.now ?? new Date();
  const env = input.env;
  const entries: MetadataRoute.Sitemap = SEO_SITEMAP_STATIC_PATHS.map((path) => ({
    url: absoluteSeoUrl(path, env),
    lastModified: now,
    changeFrequency: path === '/' || path === '/news' ? 'hourly' : 'weekly',
    priority: path === '/' ? 1 : path === '/news' ? 0.8 : 0.5,
  }));

  for (const token of input.tokens ?? []) {
    entries.push({
      url: absoluteSeoUrl(`/token/${token.tokenAddress}`, env),
      lastModified: token.launchedAt
        ? new Date(token.launchedAt * 1000)
        : now,
      changeFrequency: 'hourly',
      priority: 0.7,
    });
  }

  return entries;
}

/**
 * Best-effort token listing for the sitemap.
 * Never throws — returns [] and logs a short message on failure.
 */
export async function loadSitemapTokenRows(
  load: () => Promise<SitemapTokenRow[]>,
): Promise<SitemapTokenRow[]> {
  try {
    return await load();
  } catch {
    // Message-only: never echo driver/connection details into logs or responses.
    console.error('[sitemap] token listing skipped');
    return [];
  }
}
