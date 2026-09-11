import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReownEmailProofClient } from '@/components/dev/ReownEmailProofClient';
import { isScoopReownEmailProofEnabled } from '@/lib/auth/reown-email-proof';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dev proof',
  description: 'Internal SCOOP development route.',
  path: '/dev/reown-email-proof',
  indexable: false,
});

/**
 * Temporary C.3-proof route — not in product navigation.
 * Requires NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF=1.
 */
export default function ReownEmailProofPage() {
  if (!isScoopReownEmailProofEnabled()) {
    notFound();
  }
  return <ReownEmailProofClient />;
}
