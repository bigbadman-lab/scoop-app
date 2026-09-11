import type { Metadata } from 'next';
import { AccountPageClient } from '@/components/account/AccountPageClient';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Account',
  description: 'Your SCOOP account — positions, fees, and claims.',
  path: '/account',
  indexable: false,
});

export default function AccountPage() {
  return <AccountPageClient />;
}
