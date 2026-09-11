import { describe, expect, it, vi } from 'vitest';
import {
  SEO_DEFAULT_OG_IMAGE_ALT,
  SEO_DEFAULT_OG_IMAGE_PATH,
  SEO_DEFAULT_OG_IMAGE_SIZE,
  absoluteSeoUrl,
  buildDefaultOgImage,
  buildPageMetadata,
  resolveSeoOrigin,
} from '@/lib/seo/site';
import { buildHomeJsonLd } from '@/lib/seo/json-ld';
import {
  SEO_SITEMAP_STATIC_PATHS,
  buildPublicSitemapEntries,
  loadSitemapTokenRows,
} from '@/lib/seo/build-sitemap';
import { SCOOP_CANONICAL_ORIGIN } from '@/lib/auth/chain';
import { tokenOpenGraphImagePath } from '@/lib/token/og-card';

describe('resolveSeoOrigin', () => {
  it('uses scoop.fun in production', () => {
    expect(resolveSeoOrigin({ NODE_ENV: 'production' })).toBe(SCOOP_CANONICAL_ORIGIN);
  });

  it('ignores NEXT_PUBLIC_APP_ORIGIN and VERCEL_URL in production', () => {
    expect(
      resolveSeoOrigin({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ORIGIN: 'https://scoop-app-git-feature.vercel.app',
        VERCEL_URL: 'scoop-app-git-feature.vercel.app',
        VERCEL_ENV: 'preview',
      }),
    ).toBe('https://scoop.fun');
  });

  it('uses scoop.fun when VERCEL_ENV is production even if NODE_ENV is unset', () => {
    expect(
      resolveSeoOrigin({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_APP_ORIGIN: 'https://wrong.example',
      }),
    ).toBe('https://scoop.fun');
  });

  it('uses NEXT_PUBLIC_APP_ORIGIN in non-production when set', () => {
    expect(
      resolveSeoOrigin({
        NODE_ENV: 'development',
        NEXT_PUBLIC_APP_ORIGIN: 'http://127.0.0.1:3000/',
      }),
    ).toBe('http://127.0.0.1:3000');
  });

  it('falls back to localhost in development', () => {
    expect(resolveSeoOrigin({ NODE_ENV: 'development' })).toBe('http://localhost:3000');
  });
});

describe('absoluteSeoUrl', () => {
  it('joins path to production origin', () => {
    expect(absoluteSeoUrl('/news', { NODE_ENV: 'production' })).toBe(
      'https://scoop.fun/news',
    );
  });

  it('returns origin for root path', () => {
    expect(absoluteSeoUrl('/', { NODE_ENV: 'production' })).toBe('https://scoop.fun');
  });

  it('builds production token and default OG absolute URLs on scoop.fun', () => {
    const env = {
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_ORIGIN: 'https://preview.vercel.app',
    };
    expect(absoluteSeoUrl('/token/0xabc', env)).toBe('https://scoop.fun/token/0xabc');
    expect(absoluteSeoUrl(SEO_DEFAULT_OG_IMAGE_PATH, env)).toBe(
      'https://scoop.fun/brand/og-home.jpg',
    );
  });
});

describe('buildPageMetadata', () => {
  it('sets canonical, OG, and twitter for indexable pages', () => {
    const meta = buildPageMetadata({
      title: 'Live stock news',
      description: 'Desk copy',
      path: '/news',
    });
    expect(meta.alternates).toEqual({ canonical: expect.stringMatching(/\/news$/) });
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.openGraph?.siteName).toBe('SCOOP');
    expect(meta.twitter?.card).toBe('summary_large_image');
  });

  it('uses og-home.jpg as the default social image with dimensions', () => {
    const meta = buildPageMetadata({
      title: 'SCOOP',
      description: 'Home',
      path: '/',
      absoluteTitle: true,
    });
    const ogImages = meta.openGraph?.images;
    expect(Array.isArray(ogImages)).toBe(true);
    const image = (ogImages as Array<Record<string, unknown>>)[0]!;
    expect(String(image.url)).toMatch(/\/brand\/og-home\.jpg$/);
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.alt).toBe(SEO_DEFAULT_OG_IMAGE_ALT);
    expect(meta.twitter?.images).toEqual([
      expect.stringMatching(/\/brand\/og-home\.jpg$/),
    ]);
    expect(SEO_DEFAULT_OG_IMAGE_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it('lets token pages override the default image with the dynamic OG route', () => {
    const addr = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
    const meta = buildPageMetadata({
      title: 'Hello World (HELLO)',
      description: 'Market',
      path: `/token/${addr}`,
      ogImagePath: tokenOpenGraphImagePath(addr),
      ogImageAlt: 'Hello World (HELLO) market on SCOOP',
    });
    const ogImages = meta.openGraph?.images as Array<Record<string, unknown>>;
    expect(String(ogImages[0]!.url)).toContain(`/token/${addr}/opengraph-image`);
    expect(String(ogImages[0]!.url)).not.toContain('/brand/og-home.jpg');
    expect(meta.twitter?.images).toEqual([
      expect.stringContaining(`/token/${addr}/opengraph-image`),
    ]);
  });

  it('applies noindex for private routes', () => {
    const meta = buildPageMetadata({
      title: 'Account',
      description: 'Private',
      path: '/account',
      indexable: false,
    });
    expect(meta.robots).toMatchObject({ index: false, follow: false });
  });

  it('supports absolute titles without the site template', () => {
    const meta = buildPageMetadata({
      title: 'SCOOP',
      description: 'Home',
      path: '/',
      absoluteTitle: true,
    });
    expect(meta.title).toEqual({ absolute: 'SCOOP' });
  });
});

describe('buildDefaultOgImage', () => {
  it('resolves production default OG to scoop.fun/brand/og-home.jpg', () => {
    expect(buildDefaultOgImage({ NODE_ENV: 'production' })).toEqual({
      url: 'https://scoop.fun/brand/og-home.jpg',
      width: 1200,
      height: 630,
      alt: SEO_DEFAULT_OG_IMAGE_ALT,
    });
  });
});

describe('buildHomeJsonLd', () => {
  it('emits Organization + WebSite without Article claims', () => {
    const graph = buildHomeJsonLd();
    expect(graph['@context']).toBe('https://schema.org');
    const nodes = graph['@graph'] as Array<Record<string, unknown>>;
    expect(nodes.map((n) => n['@type'])).toEqual(['Organization', 'WebSite']);
    expect(JSON.stringify(graph)).not.toMatch(/NewsArticle|AggregateRating|Offer/);
  });
});

describe('buildPublicSitemapEntries', () => {
  const prod = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;

  it('always includes static public URLs on scoop.fun', () => {
    const entries = buildPublicSitemapEntries({
      tokens: null,
      now: new Date('2026-09-11T00:00:00.000Z'),
      env: prod,
    });
    const urls = entries.map((e) => e.url);
    for (const path of SEO_SITEMAP_STATIC_PATHS) {
      expect(urls).toContain(
        path === '/' ? 'https://scoop.fun' : `https://scoop.fun${path}`,
      );
    }
  });

  it('appends token URLs when provided', () => {
    const entries = buildPublicSitemapEntries({
      tokens: [
        {
          tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
          launchedAt: 1_700_000_000,
        },
      ],
      env: prod,
    });
    expect(entries.map((e) => e.url)).toContain(
      'https://scoop.fun/token/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
  });

  it('remains valid with only static URLs when tokens are empty', () => {
    const entries = buildPublicSitemapEntries({ tokens: [], env: prod });
    expect(entries.length).toBe(SEO_SITEMAP_STATIC_PATHS.length);
    expect(entries.every((e) => e.url.startsWith('https://scoop.fun'))).toBe(true);
  });
});

describe('loadSitemapTokenRows', () => {
  it('returns rows on success', async () => {
    await expect(
      loadSitemapTokenRows(async () => [
        { tokenAddress: '0xabc', launchedAt: null },
      ]),
    ).resolves.toEqual([{ tokenAddress: '0xabc', launchedAt: null }]);
  });

  it('returns [] and does not throw when the loader fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      loadSitemapTokenRows(async () => {
        throw new Error('db down');
      }),
    ).resolves.toEqual([]);
    expect(spy).toHaveBeenCalledWith('[sitemap] token listing skipped');
    spy.mockRestore();
  });

  it('does not log driver messages that may contain credentials', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await loadSitemapTokenRows(async () => {
      throw new Error(
        'connect ECONNREFUSED postgres://user:secret@db.example:5432/scoop',
      );
    });
    const joined = spy.mock.calls.flat().map(String).join(' ');
    expect(joined).toBe('[sitemap] token listing skipped');
    expect(joined).not.toMatch(/secret|postgres:\/\//i);
    spy.mockRestore();
  });
});
