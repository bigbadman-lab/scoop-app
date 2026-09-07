'use client';

import Link from 'next/link';
import type { TokenDiscoveryItem } from '@/lib/server/queries';
import { displayFdv } from '@/lib/format';
import { ContractCopy } from '@/components/ui/ContractCopy';
import { TokenImage } from '@/components/ui/TokenImage';

type Props = {
  token: TokenDiscoveryItem;
  quoteSymbol: string;
};

export function TokenDiscoveryItemCard({ token, quoteSymbol }: Props) {
  const fdv = displayFdv(token.fdvUsdDisplay);
  const href = `/token/${token.tokenAddress}`;

  return (
    <article className="group min-w-0">
      <Link
        href={href}
        className="block focus-visible:outline-offset-4"
        data-testid="token-discovery-item"
      >
        <TokenImage
          src={token.imageUri}
          alt={token.name}
          className="w-full rounded-[var(--radius-xl)]"
          size={320}
        />
        <div className="mt-3 space-y-1">
          <p className="font-mono text-[12px] tracking-wide text-[var(--muted)]">
            ${token.symbol} / {quoteSymbol}
          </p>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--fg)]">
            {token.name}
          </h3>
          <div className="flex items-baseline gap-2 pt-1">
            {fdv ? (
              <>
                <p className="tabular text-[15px] font-semibold tracking-tight">{fdv}</p>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  FDV
                </p>
              </>
            ) : (
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                FDV unavailable
              </p>
            )}
          </div>
        </div>
      </Link>
      <div className="mt-2">
        <ContractCopy address={token.tokenAddress} />
      </div>
    </article>
  );
}
