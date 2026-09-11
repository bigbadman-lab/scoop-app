import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

const COPY: Record<string, { title: string; description: string; body: string }> = {
  terms: {
    title: 'Terms',
    description: 'SCOOP terms of use.',
    body: 'Terms of use placeholder — formal legal copy ships separately.',
  },
  privacy: {
    title: 'Privacy',
    description: 'SCOOP privacy policy.',
    body: 'Privacy policy placeholder — formal legal copy ships separately.',
  },
  risk: {
    title: 'Risk disclosure',
    description: 'SCOOP risk disclosure for tokenized markets.',
    body: 'Trading tokenized markets involves risk of loss. Formal disclosure ships separately.',
  },
  disclaimer: {
    title: 'Disclaimer',
    description: 'SCOOP disclaimer.',
    body: 'Disclaimer placeholder — formal legal copy ships separately.',
  },
};

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = COPY[slug];
  if (!page) {
    return buildPageMetadata({
      title: 'Legal',
      description: 'SCOOP legal documents.',
      path: `/legal/${slug}`,
      indexable: false,
    });
  }
  return buildPageMetadata({
    title: page.title,
    description: page.description,
    path: `/legal/${slug}`,
  });
}

export default async function LegalPage({ params }: Props) {
  const { slug } = await params;
  const page = COPY[slug];
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Legal</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{page.title}</h1>
      <p className="mt-4 text-[var(--muted)]">{page.body}</p>
    </main>
  );
}
