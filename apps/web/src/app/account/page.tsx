import { SectionHeading } from '@/components/ui/SectionHeading';

/** Minimal route shell — account redesign is out of Phase 1 scope. */
export default function AccountPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Account</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Your account</h1>
      <p className="mt-4 text-[var(--muted)]">
        Wallet auth and account surfaces ship with a later phase. A connect slot is
        reserved in the app shell.
      </p>
    </main>
  );
}
