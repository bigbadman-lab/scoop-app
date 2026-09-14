'use client';

import { useEffect, useState } from 'react';
import { TapeContractCard } from '@/components/protocol/TapeContractCard';
import type { PublicProtocolStats } from '@/lib/protocol/load-stats';
import { checksumTapeAddress } from '@/lib/protocol/tape';
import { displayCompactUsdMarketValue } from '@/lib/format';

const POLL_MS = 20_000;

function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(n)));
}

function formatUsdStat(value: string | null | undefined): string {
  return displayCompactUsdMarketValue(value) ?? '—';
}

function formatUpdatedAt(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Updated —';
  const sec = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (sec < 8) return 'Updated just now';
  if (sec < 60) return `Updated ${sec}s ago`;
  const mins = Math.floor(sec / 60);
  if (mins < 60) return `Updated ${mins}m ago`;
  return `Updated ${Math.floor(mins / 60)}h ago`;
}

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  testId: string;
};

function StatCard({ label, value, hint, testId }: StatCardProps) {
  return (
    <div
      className="min-h-[7.5rem] border border-[var(--divider)] bg-[var(--bg)] px-4 py-4 md:min-h-[8.25rem] md:px-5 md:py-5"
      data-testid={testId}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight tabular-nums text-[var(--fg)] md:text-4xl">
        {value}
      </p>
      <p className="mt-2 text-xs leading-snug text-[var(--muted-2)]">{hint}</p>
    </div>
  );
}

type Props = {
  initialStats: PublicProtocolStats;
};

/**
 * $TAPE protocol live shell — official contract + stats.
 * Polls `/api/protocol/stats` (~20s) so runtime contract updates appear without redeploy.
 */
export function ProtocolStatsLive({ initialStats }: Props) {
  const [stats, setStats] = useState(initialStats);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch('/api/protocol/stats', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as PublicProtocolStats;
        if (!cancelled && data && typeof data.updatedAt === 'string') {
          setStats({
            ...data,
            tape: {
              contractAddress: checksumTapeAddress(data.tape?.contractAddress ?? null),
            },
          });
        }
      } catch {
        // Keep last good snapshot.
      }
    }

    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const feeHint =
    stats.feeCoverage === 'unavailable'
      ? 'Distributed fee USD unavailable until quote prices resolve'
      : stats.feeCoverage === 'partial'
        ? 'Trading fees distributed to date (partial USD coverage)'
        : 'Trading fees distributed to date (USD, marked to market)';

  const buybackHint =
    stats.feeCoverage === 'unavailable'
      ? 'Buyback allocation USD unavailable until quote prices resolve'
      : 'Fees allocated to protocol buybacks (not executed buys)';

  const tapeAddress = checksumTapeAddress(stats.tape?.contractAddress ?? null);

  return (
    <div data-testid="protocol-stats-live">
      <div className="mt-10 md:mt-12">
        <TapeContractCard address={tapeAddress} />
      </div>

      <section className="mt-12 md:mt-16" aria-labelledby="protocol-stats-heading">
        <h2
          id="protocol-stats-heading"
          className="font-serif text-2xl tracking-tight text-[var(--fg)] md:text-3xl"
        >
          Protocol stats
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Canonical public-market totals. Indexer trails chain head by roughly one
          confirmation lag (~10–20s). Official contract updates from runtime settings
          within ~20s via this page&apos;s live poll.
        </p>

        <div className="mt-6 mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Near real-time protocol data
          </p>
          <p
            className="font-mono text-[11px] tabular-nums text-[var(--muted-2)]"
            data-testid="protocol-stats-freshness"
          >
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--scoop-live)] align-middle" />
            {formatUpdatedAt(stats.updatedAt, nowMs)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Markets launched"
            value={formatInteger(stats.marketsLaunched)}
            hint="Public SCOOP markets (excludes internal canaries)"
            testId="protocol-stat-markets"
          />
          <StatCard
            label="Total trades"
            value={formatInteger(stats.totalTrades)}
            hint="Indexed protocol swaps"
            testId="protocol-stat-trades"
          />
          <StatCard
            label="Total volume"
            value={formatUsdStat(stats.totalVolumeUsd)}
            hint="USD-equivalent trade volume"
            testId="protocol-stat-volume"
          />
          <StatCard
            label="Fees generated"
            value={formatUsdStat(stats.totalFeesUsd)}
            hint={feeHint}
            testId="protocol-stat-fees"
          />
          <StatCard
            label="Protocol buybacks"
            value={formatUsdStat(stats.protocolBuybackFeesUsd)}
            hint={buybackHint}
            testId="protocol-stat-buybacks"
          />
        </div>
      </section>
    </div>
  );
}
