import type { LaunchMarketReady } from '@scoop/db';
import {
  verifyIndexedLaunchAgainstReceipt,
  type IndexedLaunchExpectation,
} from '@/lib/launch/verify-indexed-launch';

/** ~2.5s — suitable for fixed-lag (~4 blocks) indexer latency. */
export const INDEXED_LAUNCH_POLL_MS = 2_500;

/** Do not wait forever; on-chain success remains truthful on timeout. */
export const INDEXED_LAUNCH_TIMEOUT_MS = 90_000;

export type IndexedLaunchLookupStatus =
  | 'pending'
  | 'ready'
  | 'network_error'
  | 'mismatch'
  | 'timeout'
  | 'aborted';

export type IndexedLaunchPollResult =
  | {
      status: 'ready';
      launch: LaunchMarketReady;
    }
  | {
      status: 'timeout';
    }
  | {
      status: 'aborted';
    }
  | {
      status: 'mismatch';
      mismatches: string[];
      launch: LaunchMarketReady;
    };

type FetchReadyResponse =
  | { ready: true; launch: LaunchMarketReady }
  | { ready: false; launch: null };

async function fetchMarketReady(args: {
  chainId: number;
  tokenAddress: string;
  signal?: AbortSignal;
}): Promise<
  | { kind: 'ready'; launch: LaunchMarketReady }
  | { kind: 'pending' }
  | { kind: 'network_error' }
> {
  try {
    const url = new URL('/api/launches/by-token', window.location.origin);
    url.searchParams.set('chainId', String(args.chainId));
    url.searchParams.set('token', args.tokenAddress);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: args.signal,
    });
    if (res.status === 404) {
      return { kind: 'pending' };
    }
    if (!res.ok) {
      return { kind: 'network_error' };
    }
    const body = (await res.json()) as FetchReadyResponse;
    if (body.ready && body.launch) {
      return { kind: 'ready', launch: body.launch };
    }
    return { kind: 'pending' };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return { kind: 'network_error' };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type WaitForIndexedLaunchInput = {
  chainId: number;
  tokenAddress: string;
  txHash: string;
  expectation: IndexedLaunchExpectation;
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  /** Invoked on each lookup outcome (pending / network_error). */
  onStatus?: (status: IndexedLaunchLookupStatus) => void;
  fetchReady?: typeof fetchMarketReady;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
};

/**
 * Immediate first lookup, then controlled polling until ready, mismatch, timeout, or abort.
 * Transient network errors retry until timeout.
 */
export async function waitForIndexedLaunch(
  input: WaitForIndexedLaunchInput,
): Promise<IndexedLaunchPollResult> {
  const intervalMs = input.intervalMs ?? INDEXED_LAUNCH_POLL_MS;
  const timeoutMs = input.timeoutMs ?? INDEXED_LAUNCH_TIMEOUT_MS;
  const now = input.now ?? (() => Date.now());
  const fetchReady = input.fetchReady ?? fetchMarketReady;
  const pause = input.sleep ?? sleep;
  const started = now();
  let first = true;

  while (true) {
    if (input.signal?.aborted) {
      input.onStatus?.('aborted');
      return { status: 'aborted' };
    }

    if (!first && now() - started >= timeoutMs) {
      input.onStatus?.('timeout');
      return { status: 'timeout' };
    }

    try {
      const result = await fetchReady({
        chainId: input.chainId,
        tokenAddress: input.tokenAddress,
        signal: input.signal,
      });

      if (result.kind === 'ready') {
        const check = verifyIndexedLaunchAgainstReceipt(
          result.launch,
          input.expectation,
        );
        if (!check.ok) {
          input.onStatus?.('mismatch');
          return {
            status: 'mismatch',
            mismatches: check.mismatches,
            launch: result.launch,
          };
        }
        input.onStatus?.('ready');
        return { status: 'ready', launch: result.launch };
      }

      if (result.kind === 'pending') {
        input.onStatus?.('pending');
      } else {
        input.onStatus?.('network_error');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        input.onStatus?.('aborted');
        return { status: 'aborted' };
      }
      input.onStatus?.('network_error');
    }

    first = false;
    if (now() - started >= timeoutMs) {
      input.onStatus?.('timeout');
      return { status: 'timeout' };
    }

    try {
      await pause(intervalMs, input.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        input.onStatus?.('aborted');
        return { status: 'aborted' };
      }
      // Non-abort sleep failures: continue toward timeout.
    }
  }
}
