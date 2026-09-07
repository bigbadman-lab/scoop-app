import { SectionHeading } from '@/components/ui/SectionHeading';

const COPY: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Terms',
    body: 'Terms of use placeholder — formal legal copy ships separately.',
  },
  privacy: {
    title: 'Privacy',
    body: 'Privacy policy placeholder — formal legal copy ships separately.',
  },
  risk: {
    title: 'Risk disclosure',
    body: 'Trading tokenized markets involves risk of loss. Formal disclosure ships separately.',
  },
  disclaimer: {
    title: 'Disclaimer',
    body: 'Disclaimer placeholder — formal legal copy ships separately.',
  },
};

type Props = { params: Promise<{ slug: string }> };

export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  const page = COPY[slug] ?? {
    title: 'Legal',
    body: 'Legal document placeholder.',
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Legal</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-[var(--muted)]">{page.body}</p>
    </main>
  );
}
