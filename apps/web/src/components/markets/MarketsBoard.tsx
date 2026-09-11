'use client';

import { useEffect, useRef, useState } from 'react';
import { MarketRow } from '@/components/markets/MarketRow';
import { createLivePoll } from '@/lib/live/create-live-poll';
import { MARKETS_LIVE_POLL_MS } from '@/lib/markets/constants';
import { fetchMarketsBoard } from '@/lib/markets/fetch-markets';
import type { MarketsBoardSnapshot } from '@/lib/markets/types';

type Props = {
  initial: MarketsBoardSnapshot;
};

export function MarketsBoard({ initial }: Props) {
  const [snapshot, setSnapshot] = useState(initial);
  const pollRef = useRef<ReturnType<typeof createLivePoll<MarketsBoardSnapshot>> | null>(null);

  useEffect(() => {
    const poll = createLivePoll<MarketsBoardSnapshot>({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial,
      fetchSnapshot: async ({ signal }) => fetchMarketsBoard(signal),
      onSnapshot: (next) => {
        setSnapshot(next);
      },
    });
    pollRef.current = poll;
    poll.start();
    return () => {
      poll.stop();
      pollRef.current = null;
    };
    // Mount once with SSR snapshot; live poll owns subsequent updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, []);

  if (snapshot.status === 'error' && snapshot.items.length === 0) {
    return (
      <p className="mt-10 text-sm text-[var(--muted)]" role="status">
        {snapshot.message ?? 'Could not load markets. Try again.'}
      </p>
    );
  }

  if (snapshot.status === 'empty' || snapshot.items.length === 0) {
    return (
      <p
        className="mt-10 text-sm text-[var(--muted)]"
        role="status"
        data-testid="markets-empty"
      >
        {snapshot.message ?? 'No active markets yet.'}
      </p>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--divider)] pb-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Ranked by FDV
        </p>
        <p
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-live)]"
          data-testid="markets-live"
          aria-live="polite"
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--scoop-live)]"
            aria-hidden
          />
          Live
        </p>
      </div>

      <ul className="divide-y divide-[var(--divider)]" data-testid="markets-list">
        {snapshot.items.map((market, index) => (
          <MarketRow
            key={market.tokenAddress}
            rank={index + 1}
            market={market}
          />
        ))}
      </ul>
    </div>
  );
}
