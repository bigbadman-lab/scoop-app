import type { MetadataRoute } from 'next';
import { resolveSeoOrigin } from '@/lib/seo/site';

/**
 * Crawl policy for scoop.fun.
 * Private/transactional/tooling routes are disallowed; public content remains crawlable.
 * robots.txt is not access control — account APIs still require auth.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = resolveSeoOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/account',
          '/account/',
          '/launch',
          '/launch/',
          '/dev/',
          '/news/*/launch',
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
