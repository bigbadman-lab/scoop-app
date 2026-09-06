import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SCOOP',
  description: 'SCOOP production app bootstrap — Phase 6A.4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
