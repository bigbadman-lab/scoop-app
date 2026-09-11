import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { TokenMarketShell, TokenMarketUnavailable } from '@/components/token/TokenMarketShell';
import { buildPageMetadata } from '@/lib/seo/site';
import { loadTokenPage } from '@/lib/token/load-token-page';
import { tokenOpenGraphImagePath } from '@/lib/token/og-card';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ address: string }> };

const loadTokenPageCached = cache(loadTokenPage);

function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const result = await loadTokenPageCached(address);

  if (result.status === 'invalid' || result.status === 'not_found') {
    return buildPageMetadata({
      title: 'Market not found',
      description: 'No SCOOP market exists for this token address.',
      path: `/token/${address}`,
      indexable: false,
    });
  }

  if (result.status === 'unavailable') {
    return buildPageMetadata({
      title: 'Market unavailable',
      description: 'This SCOOP market could not be loaded right now.',
      path: `/token/${address}`,
      indexable: false,
    });
  }

  const { token, quoteSymbol } = result;
  const title = `${token.name} (${token.symbol})`;
  const descriptionParts = [
    `${token.name} (${token.symbol}) market on SCOOP / Robinhood Chain`,
    `quoted in ${quoteSymbol}`,
    shortenAddress(token.tokenAddress),
  ];
  if (token.description?.trim()) {
    descriptionParts.push(token.description.trim().slice(0, 140));
  }

  return buildPageMetadata({
    title,
    description: descriptionParts.join(' · '),
    path: `/token/${token.tokenAddress}`,
    ogImagePath: tokenOpenGraphImagePath(token.tokenAddress),
    ogImageAlt: `${token.name} (${token.symbol}) market on SCOOP`,
  });
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const result = await loadTokenPageCached(address);

  if (result.status === 'invalid' || result.status === 'not_found') {
    notFound();
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-4 md:px-8 md:py-5 lg:px-10">
      {result.status === 'unavailable' ? (
        <TokenMarketUnavailable
          title="Market unavailable"
          message="Market data could not be loaded right now. Try again shortly."
        />
      ) : null}
      {result.status === 'ok' ? (
        <TokenMarketShell
          token={result.token}
          quoteSymbol={result.quoteSymbol}
          quoteImageUrl={result.quoteImageUrl}
        />
      ) : null}
    </main>
  );
}
