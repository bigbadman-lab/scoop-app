import { notFound } from 'next/navigation';
import { ReownEmailProofClient } from '@/components/dev/ReownEmailProofClient';
import { isScoopReownEmailProofEnabled } from '@/lib/auth/reown-email-proof';

export const dynamic = 'force-dynamic';

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
