import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistMono } from 'geist/font/mono';
import '@fontsource/open-sauce-sans/latin-400.css';
import '@fontsource/open-sauce-sans/latin-500.css';
import '@fontsource/open-sauce-sans/latin-600.css';
import '@fontsource/open-sauce-sans/latin-700.css';
import { AppShell } from '@/components/shell/AppShell';
import { WalletShellProvider } from '@/components/auth/WalletShellProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SCOOP',
  description: 'Live financial publication and markets — Robinhood Chain.',
  icons: {
    icon: '/brand/MARK.png',
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
