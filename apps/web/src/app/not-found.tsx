import type { Metadata } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Page not found',
  description: 'This SCOOP page does not exist.',
  path: '/',
  indexable: false,
});

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        404
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-4 text-[var(--muted)]">
        That URL is not a published SCOOP page.
      </p>
      <p className="mt-6">
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-2 hover:underline"
        >
          Back to home
        </Link>
      </p>
    </main>
  );
}
