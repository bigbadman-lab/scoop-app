import { SectionHeading } from '@/components/ui/SectionHeading';

/** Minimal route shell — four-step launch UI is out of Phase 1 scope. */
export default function LaunchPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Create</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Launch a market</h1>
      <p className="mt-4 text-[var(--muted)]">
        The creation flow is intentionally deferred. Use Create from the shell when it
        ships.
      </p>
    </main>
  );
}
