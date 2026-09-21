import { describe, expect, it, vi } from 'vitest';
import { refreshPumpHolderCounts } from './refresh.js';

describe('refreshPumpHolderCounts', () => {
  it('persists successful counts and skips DB write on failure', async () => {
    const persist = vi.fn(async (_db: unknown, input: { mint: string; holderCount: number }) => ({
      mint: input.mint,
      holderCount: input.holderCount,
    }));
    const fetchHolderCount = vi.fn(async (_rpc: unknown, mint: string) => {
      if (mint === 'bad') throw new Error('rpc failed');
      return {
        holderCount: 3,
        positiveTokenAccountCount: 3,
        totalTokenAccountCount: 4,
        pagesFetched: 1,
      };
    });

    const result = await refreshPumpHolderCounts({
      db: {} as never,
      rpc: (async () => null) as never,
      getMints: () => ['good', 'bad'],
      fetchHolderCount,
      persistHolderCount: persist as never,
      now: () => new Date('2026-09-21T21:00:00Z'),
    });

    expect(result).toEqual({ attempted: 2, succeeded: 1, failed: 1 });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ mint: 'good', holderCount: 3 }),
    );
  });

  it('never persists zero from a failed fetch', async () => {
    const persist = vi.fn();
    await refreshPumpHolderCounts({
      db: {} as never,
      rpc: (async () => null) as never,
      getMints: () => ['x'],
      fetchHolderCount: async () => {
        throw new Error('boom');
      },
      persistHolderCount: persist as never,
    });
    expect(persist).not.toHaveBeenCalled();
  });
});
