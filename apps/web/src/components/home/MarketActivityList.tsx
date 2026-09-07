import Link from 'next/link';
import type { MarketActivityResult } from '@/lib/discovery/load-home';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import { quoteDisplaySymbol } from '@/lib/quotes/resolve';
import {
  displayFdv,
  formatCompactAge,
  formatProgressPercent,
} from '@/lib/format';

type Props = {
  activity: MarketActivityResult;
  catalogue: readonly PublicQuoteCatalogueItem[];
};

export function MarketActivityList({ activity, catalogue }: Props) {
  if (activity.status === 'error') {
    return (
      <p className="text-sm text-[var(--muted)]" role="status">
        {activity.message ?? 'Market activity unavailable.'}
      </p>
    );
  }

  if (activity.status === 'empty' || activity.items.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]" role="status" data-testid="activity-empty">
        {activity.message ?? 'No live market activity yet.'}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--divider)]" data-testid="market-activity">
      {activity.items.map(({ kind, token }) => {
        const quote = quoteDisplaySymbol(token.quoteAsset, catalogue);
        const fdv = displayFdv(token.fdvUsdDisplay);
        const meta =
          kind === 'new'
            ? `New · ${formatCompactAge(token.ageSeconds)}`
            : `Bonding · ${formatProgressPercent(token.launchProgressBps)}`;

        return (
          <li key={`${kind}-${token.tokenAddress}`} className="py-4 first:pt-0">
            <Link
              href={`/token/${token.tokenAddress}`}
              className="block space-y-1 focus-visible:outline-offset-4"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {meta}
              </p>
              <p className="font-mono text-[13px] tracking-wide">
                ${token.symbol} / {quote}
              </p>
              <p className="text-[15px] font-semibold tracking-tight">{token.name}</p>
              <p className="tabular text-sm text-[var(--muted)]">
                {fdv ? `${fdv} FDV` : 'FDV unavailable'}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
