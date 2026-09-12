import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { DisclaimerContent } from '@/components/legal/DisclaimerContent';
import { PrivacyPolicyContent } from '@/components/legal/PrivacyPolicyContent';
import { RiskDisclosureContent } from '@/components/legal/RiskDisclosureContent';
import { TermsOfUseContent } from '@/components/legal/TermsOfUseContent';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { buildPageMetadata } from '@/lib/seo/site';

type LegalPageCopy = {
  title: string;
  description: string;
  /** Plain placeholder body when structured content is not yet available. */
  body?: string;
  content?: ReactNode;
};

const COPY: Record<string, LegalPageCopy> = {
  terms: {
    title: 'Terms of Use',
    description:
      'Terms of Use for scoop.fun, the SCOOP interface and the SCOOP Protocol, operated by Scoop Tech Ltd.',
    content: <TermsOfUseContent />,
  },
  privacy: {
    title: 'Privacy Policy',
    description:
      'Privacy Policy for scoop.fun and related SCOOP services operated by Scoop Tech Ltd.',
    content: <PrivacyPolicyContent />,
  },
  risk: {
    title: 'Risk Disclosure',
    description:
      'Important risks associated with using scoop.fun, the SCOOP Protocol and digital assets accessible through them.',
    content: <RiskDisclosureContent />,
  },
  disclaimer: {
    title: 'Disclaimer',
    description:
      'Disclaimer for scoop.fun and related SCOOP content and services operated by Scoop Tech Ltd.',
    content: <DisclaimerContent />,
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
      {page.content ?? <p className="mt-4 text-[var(--muted)]">{page.body}</p>}
    </main>
  );
}
