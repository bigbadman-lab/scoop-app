import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  clearFreshLaunchHandoff,
  hasFreshLaunchEvidence,
  loadFreshLaunchHandoff,
  type FreshLaunchHandoff,
} from '@/lib/launch/fresh-launch-handoff';
import {
  INDEXED_LAUNCH_POLL_MS,
  INDEXED_LAUNCH_TIMEOUT_MS,
} from '@/lib/launch/wait-for-indexed-launch';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { truncateAddress } from '@/lib/format';

export function freshLaunchSyncCopy(timedOut: boolean): {
  title: string;
  body: string;
} {
  if (timedOut) {
    return {
      title: 'Market data is taking longer than expected to load.',
      body: 'Your market has launched. Try checking again shortly.',
    };
  }
  return {
    title: 'Market loading…',
    body: 'Your market has launched. Market data will appear shortly.',
  };
}

/** Genuine no-market copy — only when fresh-launch handoff is absent. */
export const FRESH_LAUNCH_UNKNOWN_COPY = {
  title: 'Market not found',
  body: 'No SCOOP market exists for this token address.',
} as const;

export const FRESH_LAUNCH_RETRY_LABEL = 'Retry sync check';
export const FRESH_LAUNCH_SYNCING_STATUS = 'Syncing market data…';

type Mode =
  | { kind: 'checking' }
  | { kind: 'unknown' }
  | { kind: 'syncing'; handoff: FreshLaunchHandoff; timedOut: boolean };

type Props = {
  address: string;
};

async function fetchTokenReady(address: string, signal: AbortSignal): Promise<boolean> {
  const url = new URL(`/api/tokens/${address}`, window.location.origin);
  url.searchParams.set('chainId', String(ROBINHOOD_CHAIN_ID));
  const res = await fetch(url.toString(), { signal, cache: 'no-store' });
  return res.ok;
}

/**
 * Client gate for valid addresses with no indexed DB row yet.
 * Shows a brief sync shell only when session evidence proves a fresh SCOOP launch.
 * Arbitrary unknown addresses stay not-found (never falsely "Market is live").
 */
export function TokenFreshLaunchGate({ address }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hasFreshLaunchEvidence(address)) {
      setMode({ kind: 'unknown' });
      return;
    }
    const handoff = loadFreshLaunchHandoff(address);
    if (!handoff) {
      setMode({ kind: 'unknown' });
      return;
    }
    const evidence: FreshLaunchHandoff = handoff;
    setMode({ kind: 'syncing', handoff: evidence, timedOut: false });

    const ac = new AbortController();
    const started = Date.now();

    async function poll() {
      while (!ac.signal.aborted) {
        try {
          const ready = await fetchTokenReady(address, ac.signal);
          if (ready) {
            clearFreshLaunchHandoff();
            router.refresh();
            return;
          }
        } catch {
          if (ac.signal.aborted) return;
        }
        if (Date.now() - started >= INDEXED_LAUNCH_TIMEOUT_MS) {
          setMode({ kind: 'syncing', handoff: evidence, timedOut: true });
          return;
        }
        await new Promise((r) => window.setTimeout(r, INDEXED_LAUNCH_POLL_MS));
      }
    }

    void poll();
    return () => ac.abort();
  }, [address, router, attempt]);

  if (mode.kind === 'checking') {
    return (
      <div
        className="rounded-[var(--radius-xl)] border border-dashed border-[var(--divider)] px-6 py-12 text-center"
        data-testid="token-fresh-launch-checking"
      >
        <p className="text-[15px] text-[var(--muted)]">Checking market…</p>
      </div>
    );
  }

  if (mode.kind === 'unknown') {
    return (
      <div data-testid="token-market-not-found">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          404
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {FRESH_LAUNCH_UNKNOWN_COPY.title}
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          {FRESH_LAUNCH_UNKNOWN_COPY.body}
        </p>
        <p className="mt-6">
          <Link
            href="/"
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] underline-offset-2 hover:underline"
          >
            Back to home
          </Link>
        </p>
      </div>
    );
  }

  const { handoff, timedOut } = mode;
  const copy = freshLaunchSyncCopy(timedOut);

  return (
    <div
      className="rounded-[var(--radius-xl)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-6 py-10"
      data-testid="token-fresh-launch-syncing"
    >
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="mt-3 text-[15px] text-[var(--muted)]">{copy.body}</p>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            Token
          </dt>
          <dd className="text-[var(--fg)]">
            {handoff.name} (${handoff.symbol})
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            Address
          </dt>
          <dd className="font-mono text-[12px] text-[var(--fg)]">
            {truncateAddress(handoff.tokenAddress)}
          </dd>
        </div>
      </dl>

      {!timedOut ? (
        <p
          className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]"
          data-testid="token-syncing-market-data"
        >
          {FRESH_LAUNCH_SYNCING_STATUS}
        </p>
      ) : null}

      {timedOut ? (
        <button
          type="button"
          className="mt-4 min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-orange)] underline-offset-4 hover:underline"
          data-testid="token-sync-retry"
          onClick={() => setAttempt((n) => n + 1)}
        >
          {FRESH_LAUNCH_RETRY_LABEL}
        </button>
      ) : null}
    </div>
  );
}
