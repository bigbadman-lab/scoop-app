import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LaunchMarketReady } from '@scoop/db';
import { waitForIndexedLaunch } from '@/lib/launch/wait-for-indexed-launch';

const readyLaunch: LaunchMarketReady = {
  chainId: 4663,
  tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  launchTxHash:
    '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  creatorId:
    '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  quoteAsset: '0xdddddddddddddddddddddddddddddddddddddddd',
  deployerAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  poolId: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  feeDistributorAddress: '0x1111111111111111111111111111111111111111',
  liquidityLockerAddress: '0x2222222222222222222222222222222222222222',
  name: 'Alpha',
  symbol: 'ALP',
};

const expectation = {
  chainId: 4663,
  tokenAddress: readyLaunch.tokenAddress,
  txHash: readyLaunch.launchTxHash,
  creatorId: readyLaunch.creatorId,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForIndexedLaunch', () => {
  it('checks immediately on first tick', async () => {
    const fetchReady = vi.fn(async () => ({
      kind: 'ready' as const,
      launch: readyLaunch,
    }));
    const statuses: string[] = [];
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      intervalMs: 50,
      timeoutMs: 1_000,
      onStatus: (s) => statuses.push(s),
    });
    expect(fetchReady).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ready');
    expect(statuses[0]).toBe('ready');
  });

  it('transitions pending → ready across polls', async () => {
    let calls = 0;
    const fetchReady = vi.fn(async () => {
      calls += 1;
      if (calls < 3) return { kind: 'pending' as const };
      return { kind: 'ready' as const, launch: readyLaunch };
    });
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      sleep: async () => {},
      intervalMs: 5,
      timeoutMs: 5_000,
    });
    expect(result.status).toBe('ready');
    expect(fetchReady.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('retries transient network errors until ready', async () => {
    let calls = 0;
    const fetchReady = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return { kind: 'network_error' as const };
      return { kind: 'ready' as const, launch: readyLaunch };
    });
    const statuses: string[] = [];
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      sleep: async () => {},
      intervalMs: 5,
      timeoutMs: 5_000,
      onStatus: (s) => statuses.push(s),
    });
    expect(result.status).toBe('ready');
    expect(statuses).toContain('network_error');
  });

  it('times out while still pending', async () => {
    let t = 0;
    const fetchReady = vi.fn(async () => ({ kind: 'pending' as const }));
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      sleep: async () => {},
      intervalMs: 5,
      timeoutMs: 20,
      now: () => {
        t += 10;
        return t;
      },
    });
    expect(result.status).toBe('timeout');
  });

  it('aborts when signal is aborted', async () => {
    const ac = new AbortController();
    const fetchReady = vi.fn(async () => {
      ac.abort();
      return { kind: 'pending' as const };
    });
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      signal: ac.signal,
      sleep: async (_ms, signal) => {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
      },
      intervalMs: 50,
      timeoutMs: 5_000,
    });
    expect(result.status).toBe('aborted');
  });

  it('returns mismatch without claiming ready', async () => {
    const fetchReady = vi.fn(async () => ({
      kind: 'ready' as const,
      launch: {
        ...readyLaunch,
        tokenAddress: '0x9999999999999999999999999999999999999999',
      },
    }));
    const result = await waitForIndexedLaunch({
      chainId: 4663,
      tokenAddress: readyLaunch.tokenAddress,
      txHash: readyLaunch.launchTxHash,
      expectation,
      fetchReady,
      intervalMs: 5,
      timeoutMs: 1_000,
    });
    expect(result.status).toBe('mismatch');
  });
});
