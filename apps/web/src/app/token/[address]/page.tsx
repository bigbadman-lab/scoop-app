import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { TokenFreshLaunchGate } from '@/components/token/TokenFreshLaunchGate';
import { TokenMarketShell, TokenMarketUnavailable } from '@/components/token/TokenMarketShell';
import { loadOfficialTapePublicSafe } from '@/lib/official-tape/load-official-tape-public';
import { buildPageMetadata } from '@/lib/seo/site';
import { loadTokenPage } from '@/lib/token/load-token-page';
import { TOKEN_OG_SIZE, tokenOpenGraphImagePath } from '@/lib/token/og-card';

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

  if (result.status === 'invalid') {
    return buildPageMetadata({
      title: 'Market not found',
      description: 'No SCOOP market exists for this token address.',
      path: `/token/${address}`,
      indexable: false,
    });
  }

  if (result.status === 'not_found') {
    return buildPageMetadata({
      title: 'Market syncing',
      description: 'SCOOP is syncing the latest market data for this token.',
      path: `/token/${result.address}`,
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
  const isPump = token.marketSource === 'pump';
  const networkLabel = isPump ? 'Solana' : 'Robinhood Chain';
  const railLabel = isPump ? 'Pump.fun' : token.marketSource === 'pons_v2' ? 'Pons' : 'SCOOP';
  const descriptionParts = [
    `${token.name} (${token.symbol}) market on SCOOP / ${networkLabel} via ${railLabel}`,
    isPump ? 'quoted in SOL' : `quoted in ${quoteSymbol}`,
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
    ogImageWidth: TOKEN_OG_SIZE.width,
    ogImageHeight: TOKEN_OG_SIZE.height,
  });
}

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const [result, officialTape] = await Promise.all([
    loadTokenPageCached(address),
    loadOfficialTapePublicSafe(),
  ]);

  if (result.status === 'invalid') {
    notFound();
  }

  const officialTapeBadges =
    result.status === 'ok' &&
    officialTape &&
    officialTape.mint === result.token.tokenAddress
      ? { lockBadgeCopy: officialTape.lockBadgeCopy }
      : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-3 md:px-8 md:py-4 lg:px-10">
      {result.status === 'not_found' ? (
        <TokenFreshLaunchGate address={result.address} />
      ) : null}
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
          lore={result.lore}
          officialTapeBadges={officialTapeBadges}
        />
      ) : null}
    </main>
  );
}
