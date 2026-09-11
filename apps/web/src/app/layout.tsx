import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistMono } from 'geist/font/mono';
import '@fontsource/open-sauce-sans/latin-400.css';
import '@fontsource/open-sauce-sans/latin-500.css';
import '@fontsource/open-sauce-sans/latin-600.css';
import '@fontsource/open-sauce-sans/latin-700.css';
import { AppShell } from '@/components/shell/AppShell';
import { WalletShellProvider } from '@/components/auth/WalletShellProvider';
import {
  SEO_DEFAULT_DESCRIPTION,
  SEO_DEFAULT_OG_IMAGE_ALT,
  SEO_DEFAULT_OG_IMAGE_PATH,
  SEO_DEFAULT_OG_IMAGE_SIZE,
  SEO_SITE_NAME,
  absoluteSeoUrl,
  resolveSeoOrigin,
} from '@/lib/seo/site';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(resolveSeoOrigin()),
  title: {
    default: SEO_SITE_NAME,
    template: `%s · ${SEO_SITE_NAME}`,
  },
  description: SEO_DEFAULT_DESCRIPTION,
  applicationName: SEO_SITE_NAME,
  authors: [{ name: SEO_SITE_NAME, url: absoluteSeoUrl('/') }],
  creator: SEO_SITE_NAME,
  publisher: SEO_SITE_NAME,
  icons: {
    icon: '/brand/MARK.png',
  },
  openGraph: {
    type: 'website',
    siteName: SEO_SITE_NAME,
    locale: 'en_US',
    url: absoluteSeoUrl('/'),
    title: SEO_SITE_NAME,
    description: SEO_DEFAULT_DESCRIPTION,
    images: [
      {
        url: SEO_DEFAULT_OG_IMAGE_PATH,
        width: SEO_DEFAULT_OG_IMAGE_SIZE.width,
        height: SEO_DEFAULT_OG_IMAGE_SIZE.height,
        alt: SEO_DEFAULT_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SEO_SITE_NAME,
    description: SEO_DEFAULT_DESCRIPTION,
    images: [SEO_DEFAULT_OG_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: '#FC4C00',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await headers()).get('cookie');

  return (
    <html lang="en" className={GeistMono.variable}>
      <body className="bg-[var(--bg)] text-[var(--fg)] antialiased">
        <WalletShellProvider cookies={cookieHeader}>
          <AppShell>{children}</AppShell>
        </WalletShellProvider>
      </body>
    </html>
  );
}
