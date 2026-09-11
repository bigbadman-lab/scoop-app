import type { Metadata } from 'next';
import { SCOOP_CANONICAL_ORIGIN } from '@/lib/auth/chain';

/** Production SEO domain — always used for sitemap/canonicals/OG in production. */
export const SEO_SITE_NAME = 'SCOOP';

export const SEO_DEFAULT_DESCRIPTION =
  'Live stock news and token markets on Robinhood Chain. Turn news into markets.';

/** Default branded social preview — `public/brand/og-home.jpg` (1200×630). */
export const SEO_DEFAULT_OG_IMAGE_PATH = '/brand/og-home.jpg';

export const SEO_DEFAULT_OG_IMAGE_ALT =
  'SCOOP — make a market out of it. Live stock news and token markets on Robinhood Chain.';

export const SEO_DEFAULT_OG_IMAGE_SIZE = {
  width: 1200,
  height: 630,
} as const;

/**
 * Absolute site origin for metadataBase / sitemap / canonicals / OG.
 *
 * Production SEO identity is fixed to https://scoop.fun.
 * Never use VERCEL_URL / preview hosts / NEXT_PUBLIC_APP_ORIGIN in production —
 * those may be present on Vercel production and preview builds (NODE_ENV=production).
 * Local/test may use NEXT_PUBLIC_APP_ORIGIN or localhost for ergonomics only.
 */
export function resolveSeoOrigin(env: NodeJS.ProcessEnv = process.env): string {
  // Vercel production + any NODE_ENV=production deploy (incl. previews): fixed domain.
  if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    return SCOOP_CANONICAL_ORIGIN;
  }
  const override = (env.NEXT_PUBLIC_APP_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (override) return override;
  return 'http://localhost:3000';
}

export function absoluteSeoUrl(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const origin = resolveSeoOrigin(env);
  if (!path || path === '/') return origin;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildDefaultOgImage(env: NodeJS.ProcessEnv = process.env): {
  url: string;
  width: number;
  height: number;
  alt: string;
} {
  return {
    url: absoluteSeoUrl(SEO_DEFAULT_OG_IMAGE_PATH, env),
    width: SEO_DEFAULT_OG_IMAGE_SIZE.width,
    height: SEO_DEFAULT_OG_IMAGE_SIZE.height,
    alt: SEO_DEFAULT_OG_IMAGE_ALT,
  };
}

export const NOINDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  /** Absolute title without site template. */
  absoluteTitle?: boolean;
  indexable?: boolean;
  /** Override default `/brand/og-home.jpg` (e.g. token opengraph-image route). */
  ogImagePath?: string;
  ogImageAlt?: string;
}): Metadata {
  const url = absoluteSeoUrl(input.path);
  const imagePath = input.ogImagePath ?? SEO_DEFAULT_OG_IMAGE_PATH;
  const imageUrl = absoluteSeoUrl(imagePath);
  const imageAlt = input.ogImageAlt ?? SEO_DEFAULT_OG_IMAGE_ALT;
  const indexable = input.indexable !== false;
  const isDefaultImage = imagePath === SEO_DEFAULT_OG_IMAGE_PATH;

  return {
    title: input.absoluteTitle
      ? { absolute: input.title }
      : input.title,
    description: input.description,
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : NOINDEX_ROBOTS,
    openGraph: {
      type: 'website',
      url,
      siteName: SEO_SITE_NAME,
      title: input.title,
      description: input.description,
      images: [
        isDefaultImage
          ? {
              url: imageUrl,
              width: SEO_DEFAULT_OG_IMAGE_SIZE.width,
              height: SEO_DEFAULT_OG_IMAGE_SIZE.height,
              alt: imageAlt,
            }
          : { url: imageUrl, alt: imageAlt },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: [imageUrl],
    },
  };
}
