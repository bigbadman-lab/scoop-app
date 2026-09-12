'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MarketRow } from '@/components/markets/MarketRow';
import { createLivePoll } from '@/lib/live/create-live-poll';
import {
  MARKETS_DESKTOP_ROW_GRID,
  MARKETS_LIVE_POLL_MS,
  MARKETS_STALE_AFTER_MS,
} from '@/lib/markets/constants';
import { fetchMarketsBoard } from '@/lib/markets/fetch-markets';
import type {
  MarketsBoardSnapshot,
  MarketsLiveHealth,
} from '@/lib/markets/types';
import {
  applyMarketsBoardView,
  DEFAULT_MARKETS_SORT,
  formatMarketsFeedUpdatedAt,
  MARKETS_SORT_OPTIONS,
  marketsViewLeaderId,
  type MarketsSortId,
} from '@/lib/markets/view';

type Props = {
  initial: MarketsBoardSnapshot;
};

const LEADER_PULSE_MS = 750;

export function MarketsBoard({ initial }: Props) {
  const [snapshot, setSnapshot] = useState<MarketsBoardSnapshot>({
    ...initial,
    liveHealth: initial.liveHealth ?? 'live',
  });
  const [sort, setSort] = useState<MarketsSortId>(DEFAULT_MARKETS_SORT);
  const [query, setQuery] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pulseLeaderId, setPulseLeaderId] = useState<string | null>(null);

  const lastGoodRef = useRef<MarketsBoardSnapshot>({
    ...initial,
    liveHealth: initial.liveHealth ?? 'live',
  });
  const lastSuccessAtRef = useRef<number>(initial.updatedAt ?? Date.now());
  const healthRef = useRef<MarketsLiveHealth>(initial.liveHealth ?? 'live');
  const initialRef = useRef(initial);
  const leaderArmedRef = useRef(false);
  const lastLeaderIdRef = useRef<string | null>(null);
  const sortRef = useRef(sort);

  useEffect(() => {
    const seed = {
      ...initialRef.current,
      liveHealth: initialRef.current.liveHealth ?? ('live' as const),
    };
    lastGoodRef.current = seed;
    lastSuccessAtRef.current = seed.updatedAt ?? Date.now();
    healthRef.current = seed.liveHealth ?? 'live';

    const poll = createLivePoll<MarketsBoardSnapshot>({
      pollMs: MARKETS_LIVE_POLL_MS,
      initial: seed,
      fetchSnapshot: async ({ signal }) => {
        const next = await fetchMarketsBoard(signal);
        const now = Date.now();
        if (next != null) {
          lastSuccessAtRef.current = next.updatedAt ?? now;
          healthRef.current = 'live';
          const ok = { ...next, liveHealth: 'live' as const };
          lastGoodRef.current = ok;
          return ok;
        }
        if (now - lastSuccessAtRef.current >= MARKETS_STALE_AFTER_MS) {
          if (healthRef.current !== 'stale') {
            healthRef.current = 'stale';
            const stale: MarketsBoardSnapshot = {
              ...lastGoodRef.current,
              liveHealth: 'stale',
            };
            lastGoodRef.current = stale;
            return stale;
          }
        }
        return null;
      },
      onSnapshot: (next) => {
        lastGoodRef.current = next;
        setSnapshot(next);
      },
    });
    poll.start();
    return () => {
      poll.stop();
    };
  }, []);

  // Tick relative "Updated Xs ago" between polls.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Leadership-change pulse: only when live data changes #1 within the same sort.
  useEffect(() => {
    const leaderId = marketsViewLeaderId(snapshot.items, sort);

    if (sortRef.current !== sort) {
      sortRef.current = sort;
      lastLeaderIdRef.current = leaderId;
      leaderArmedRef.current = true;
      setPulseLeaderId(null);
      return;
    }

    if (!leaderArmedRef.current) {
      lastLeaderIdRef.current = leaderId;
      leaderArmedRef.current = true;
      return;
    }

    const prev = lastLeaderIdRef.current;
    if (prev != null && leaderId != null && prev !== leaderId) {
      setPulseLeaderId(leaderId);
      lastLeaderIdRef.current = leaderId;
      const t = window.setTimeout(() => setPulseLeaderId(null), LEADER_PULSE_MS);
      return () => window.clearTimeout(t);
    }

    lastLeaderIdRef.current = leaderId;
  }, [snapshot.items, sort]);

  const visibleItems = useMemo(
    () => applyMarketsBoardView(snapshot.items, { sort, query }),
    [snapshot.items, sort, query],
  );

  const liveHealth = snapshot.liveHealth ?? 'live';
  const isStale = liveHealth === 'stale';
  const updatedLabel = formatMarketsFeedUpdatedAt(
    snapshot.updatedAt,
    nowMs,
    liveHealth,
  );
  const hasSourceRows = snapshot.items.length > 0;
  const searching = query.trim().length > 0;

  function selectSort(next: MarketsSortId) {
    setSort(next);
  }

  if (snapshot.status === 'error' && !hasSourceRows) {
    return (
      <p className="mt-10 text-sm text-[var(--muted)]" role="status">
        {snapshot.message ?? 'Could not load markets. Try again.'}
      </p>
    );
  }

  if ((snapshot.status === 'empty' || !hasSourceRows) && !searching) {
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
    <div className="flex flex-1 flex-col" data-testid="markets-board">
      <div className="flex items-start justify-between gap-3">
        <p
          className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--fg)]"
          data-testid="markets-feed-label"
        >
          Market feed
        </p>
        <div className="text-right">
          <p
            className={[
              'flex items-center justify-end gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em]',
              isStale ? 'text-[var(--muted)]' : 'text-[var(--scoop-live)]',
            ].join(' ')}
            data-testid="markets-live"
            data-health={liveHealth}
            aria-live="polite"
          >
            <span
              className={[
                'inline-block h-1.5 w-1.5 rounded-full',
                isStale ? 'bg-[var(--muted)]' : 'bg-[var(--scoop-live)]',
              ].join(' ')}
              aria-hidden
            />
            {isStale ? 'Stale' : 'Live'}
          </p>
          <p
            className="mt-0.5 font-mono text-[10px] tracking-wide text-[var(--muted-2)]"
            data-testid="markets-updated-at"
          >
            {updatedLabel}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 border-b border-[var(--divider)] pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div
          role="tablist"
          aria-label="Market discovery"
          className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2"
        >
          {MARKETS_SORT_OPTIONS.map((option) => {
            const selected = sort === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`markets-sort-${option.id}`}
                onClick={() => selectSort(option.id)}
                className={[
                  'min-h-11 font-mono text-[12px] uppercase tracking-[0.16em] transition-colors',
                  selected
                    ? 'text-[var(--fg)] underline decoration-[var(--scoop-orange)] decoration-2 underline-offset-8'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]',
                ].join(' ')}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="min-w-0 sm:w-56 sm:shrink-0">
          <span className="sr-only">Search tickers</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tickers"
            data-testid="markets-search"
            autoComplete="off"
            className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted-2)] focus-visible:border-[var(--fg)]"
          />
        </label>
      </div>

      <div
        className={[
          'mt-2 hidden border-b border-[var(--divider)] pb-2 md:grid',
          MARKETS_DESKTOP_ROW_GRID,
        ].join(' ')}
      >
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          #
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Market
        </span>
        <span className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Fdv
        </span>
        <span className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Trades
        </span>
        <span className="text-right font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Holders
        </span>
      </div>

      {visibleItems.length === 0 ? (
        <p
          className="mt-10 text-sm text-[var(--muted)]"
          role="status"
          data-testid="markets-no-results"
        >
          No markets found.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--divider)]" data-testid="markets-list">
          {visibleItems.map((market) => (
            <MarketRow
              key={market.tokenAddress}
              rank={market.rank}
              market={market}
              leaderPulse={pulseLeaderId === market.tokenAddress && market.rank === 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
