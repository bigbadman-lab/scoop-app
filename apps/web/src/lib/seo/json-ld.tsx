import { SCOOP_X_URL } from '@/lib/brand';
import { SEO_SITE_NAME, SEO_DEFAULT_DESCRIPTION, absoluteSeoUrl } from '@/lib/seo/site';

/** Organization + WebSite JSON-LD for the homepage. No fake Article/Product claims. */
export function buildHomeJsonLd(): Record<string, unknown> {
  const origin = absoluteSeoUrl('/');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SEO_SITE_NAME,
        url: origin,
        logo: absoluteSeoUrl('/brand/MARK.png'),
        sameAs: [SCOOP_X_URL],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SEO_SITE_NAME,
        url: origin,
        description: SEO_DEFAULT_DESCRIPTION,
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: 'en',
      },
    ],
  };
}

export function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
