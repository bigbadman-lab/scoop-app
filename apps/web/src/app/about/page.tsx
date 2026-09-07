import { SectionHeading } from '@/components/ui/SectionHeading';

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>About</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">About SCOOP</h1>
      <p className="mt-4 text-[var(--muted)]">
        SCOOP is a live financial publication and market application on Robinhood Chain.
      </p>
    </main>
  );
}
