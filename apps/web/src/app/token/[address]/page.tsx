import { SectionHeading } from '@/components/ui/SectionHeading';

type Props = { params: Promise<{ address: string }> };

/** Minimal token route so discovery links resolve — redesign out of Phase 1. */
export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Token</SectionHeading>
      <h1 className="mt-4 break-all font-mono text-lg tracking-tight">{address}</h1>
      <p className="mt-4 text-[var(--muted)]">
        Token detail UI is out of scope for Phase 1. Market data remains available via
        the API.
      </p>
    </main>
  );
}
