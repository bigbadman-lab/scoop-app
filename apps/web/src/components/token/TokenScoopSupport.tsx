'use client';

import type { ScoopSupportBuyHistoryItem } from '@scoop/db';
import { formatCompactAge } from '@/lib/format';
import { solanaExplorerTxUrl } from '@/lib/solana/explorer';

type Props = {
  buyCount: number;
  totalSol: string;
  buys: readonly ScoopSupportBuyHistoryItem[];
  /** Client clock for relative ages (tests inject). */
  nowMs?: number;
};

function formatSol(amount: string): string {
  const t = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return t;
  const [whole, frac = ''] = t.split('.');
  const trimmedFrac = frac.replace(/0+$/, '').slice(0, 6);
  return trimmedFrac.length > 0 ? `${whole}.${trimmedFrac}` : whole;
}

/**
 * Compact SCOOP support-buy history — Pump token pages only when count > 0.
 */
export function TokenScoopSupport({
  buyCount,
  totalSol,
  buys,
  nowMs,
}: Props) {
  if (buyCount <= 0) return null;

  const clock = nowMs ?? Date.now();

  return (
    <section
      className="min-w-0"
      aria-labelledby="token-scoop-support-heading"
      data-testid="token-scoop-support"
    >
      <h2
        id="token-scoop-support-heading"
        className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
      >
        SCOOP SUPPORT
      </h2>
      <div className="mt-1.5 rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3">
        <p
          className="font-mono text-[11px] text-[var(--fg)]"
          data-testid="token-scoop-support-summary"
        >
          SCOOP has bought this market.
        </p>
        <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
          Total SCOOP buys:{' '}
          <span className="text-[var(--fg)]" data-testid="token-scoop-support-total">
            {formatSol(totalSol)} SOL
          </span>
          <span className="text-[var(--muted-2)]"> · </span>
          <span data-testid="token-scoop-support-count">
            {buyCount} {buyCount === 1 ? 'purchase' : 'purchases'}
          </span>
        </p>

        {buys.length > 0 ? (
          <ul
            className="mt-3 space-y-1.5 border-t border-[var(--divider)] pt-2"
            data-testid="token-scoop-support-history"
          >
            {buys.map((buy) => {
              const age = formatCompactAge(
                Math.max(0, Math.floor(clock / 1000) - buy.blockTime),
              );
              const href = solanaExplorerTxUrl(buy.signature);
              return (
                <li
                  key={`${buy.signature}:${buy.eventIndex}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 font-mono text-[11px]"
                >
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--scoop-green)] underline-offset-2 hover:underline"
                    data-testid="token-scoop-support-buy-link"
                  >
                    {formatSol(buy.solAmount)} SOL BUY
                  </a>
                  <span className="text-[var(--muted-2)]">{age}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="mt-2 font-mono text-[10px] leading-snug text-[var(--muted-2)]">
          Activity shown from the public SCOOP support wallet. Onchain purchases by the SCOOP
          ecosystem wallet.
        </p>
      </div>
    </section>
  );
}
