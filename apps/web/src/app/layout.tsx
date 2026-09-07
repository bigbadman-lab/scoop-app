import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Instrument_Serif } from 'next/font/google';
import { AppShell } from '@/components/shell/AppShell';
import { WalletShellProvider } from '@/components/auth/WalletShellProvider';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});

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
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="bg-[var(--bg)] text-[var(--fg)] antialiased">
        <WalletShellProvider cookies={cookieHeader}>
          <AppShell>{children}</AppShell>
        </WalletShellProvider>
      </body>
    </html>
  );
}
