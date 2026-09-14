import { describe, expect, it } from 'vitest';
import { resolveLiveScanWindow } from './scanWindow.js';

const defaults = {
  latest: 10_000n,
  canonicalCheckpoint: 9_936n,
  maxCatchupBlocks: 512,
  replayWindowBlocks: 192,
  staleLagBlocks: 256,
};

describe('resolveLiveScanWindow', () => {
  it('jumps a stale checkpoint to the near-tip replay window', () => {
    expect(resolveLiveScanWindow({ ...defaults, liveCheckpoint: 9_000n })).toEqual({
      last: 9_807n,
      fromBlock: 9_808n,
      toBlock: 10_000n,
      jumped: true,
      lagBlocks: 1_000n,
    });
  });

  it('resumes a near-tip checkpoint without jumping', () => {
    expect(resolveLiveScanWindow({ ...defaults, liveCheckpoint: 9_900n })).toEqual({
      last: 9_900n,
      fromBlock: 9_901n,
      toBlock: 10_000n,
      jumped: false,
      lagBlocks: 100n,
    });
  });

  it('caps the scan at maxCatchupBlocks', () => {
    const window = resolveLiveScanWindow({
      ...defaults,
      latest: 10_000n,
      liveCheckpoint: 9_600n,
      staleLagBlocks: 1_000,
      maxCatchupBlocks: 128,
    });

    expect(window.toBlock).toBe(9_728n);
    expect(window.jumped).toBe(false);
  });

  it('uses the replay window instead of canonical backlog when uninitialized', () => {
    const window = resolveLiveScanWindow({
      ...defaults,
      liveCheckpoint: null,
      canonicalCheckpoint: 1_000n,
    });

    expect(window.fromBlock).toBe(9_808n);
    expect(window.toBlock).toBe(10_000n);
    expect(window.jumped).toBe(true);
  });
});
