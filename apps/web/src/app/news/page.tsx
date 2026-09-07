import { SectionHeading } from '@/components/ui/SectionHeading';

/** Minimal route shell — full News UI is out of Phase 1 scope. */
export default function NewsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>News</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">News desk</h1>
      <p className="mt-4 text-[var(--muted)]">
        Full news experience arrives in a later phase. Public article display remains
        license-gated.
      </p>
    </main>
  );
}
