import { TokenMarketShell, TokenMarketUnavailable } from '@/components/token/TokenMarketShell';
import { loadTokenPage } from '@/lib/token/load-token-page';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ address: string }> };

export default async function TokenPage({ params }: Props) {
  const { address } = await params;
  const result = await loadTokenPage(address);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-4 md:px-8 md:py-5 lg:px-10">
      {result.status === 'invalid' ? (
        <TokenMarketUnavailable
          title="Invalid market"
          message="That address is not a valid token market link."
        />
      ) : null}
      {result.status === 'not_found' ? (
        <TokenMarketUnavailable
          title="Market not found"
          message="No indexed market exists for this address on Robinhood Chain."
        />
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
        />
      ) : null}
    </main>
  );
}
