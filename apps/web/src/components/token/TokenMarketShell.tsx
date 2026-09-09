import type { TokenDetail } from '@/lib/server/queries';
import { TokenMarketLiveView } from '@/components/token/TokenMarketLiveView';

type Props = {
  token: TokenDetail;
  quoteSymbol: string;
  quoteImageUrl?: string | null;
};

/**
 * Token market page V2 — SSR seed handed to the client live market layer.
 */
export function TokenMarketShell({
  token,
  quoteSymbol,
  quoteImageUrl = null,
}: Props) {
  return (
    <TokenMarketLiveView
      token={token}
      quoteSymbol={quoteSymbol}
      quoteImageUrl={quoteImageUrl}
    />
  );
}

export function TokenMarketUnavailable({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-xl)] border border-dashed border-[var(--divider)] px-6 py-12 text-center"
      data-testid="token-market-unavailable"
    >
      <h1 className="text-xl font-semibold tracking-tight text-[var(--fg)]">{title}</h1>
      <p className="mt-3 text-[15px] text-[var(--muted)]">{message}</p>
    </div>
  );
}
