import { describe, expect, it } from 'vitest';
import {
  computeBehindTargetBlocks,
  computeEffectiveBlocksPerSecond,
  formatCanonicalHealthNotes,
  type CanonicalThroughputSnapshot,
} from './canonicalMetrics.js';

describe('canonicalMetrics', () => {
  it('computes behindTarget from current target and checkpoint', () => {
    expect(
      computeBehindTargetBlocks({ targetHead: 1000n, checkpoint: 900n }),
    ).toBe(100n);
    expect(
      computeBehindTargetBlocks({ targetHead: 1000n, checkpoint: 1000n }),
    ).toBe(0n);
    expect(
      computeBehindTargetBlocks({ targetHead: 1000n, checkpoint: 1005n }),
    ).toBe(0n);
  });

  it('does not report caught-up when behindTarget > 0', () => {
    const snapshot: CanonicalThroughputSnapshot = {
      mode: 'range-catchup',
      latestBlock: 1100n,
      targetHead: 1036n,
      checkpoint: 800n,
      behindTargetBlocks: 236n,
      latestLagBlocks: 300n,
      blocksAttempted: 512,
      blocksProcessed: 12,
      interestingBlocks: 12,
      emptyBlocksOrSpans: 500,
      rpcMs: 100,
      decodeMs: 10,
      writeMs: 50,
      loopMs: 800,
      effectiveBlocksPerSecond: 640,
      rpcRetries: 0,
      confirmMode: 'fixed-lag',
      confirmLagBlocks: 64,
      liveLagBlocks: 5n,
    };
    const notes = formatCanonicalHealthNotes(snapshot);
    expect(notes).toContain('behindTargetBlocks=236');
    expect(notes).not.toContain('caught up');
    expect(notes).toContain('blkPerSec=640');
  });

  it('idle notes include current behindTarget=0 and lag fields', () => {
    const notes = formatCanonicalHealthNotes({
      mode: 'idle',
      latestBlock: 1064n,
      targetHead: 1000n,
      checkpoint: 1000n,
      behindTargetBlocks: 0n,
      latestLagBlocks: 64n,
      blocksAttempted: 0,
      blocksProcessed: 0,
      interestingBlocks: 0,
      emptyBlocksOrSpans: 0,
      rpcMs: 0,
      decodeMs: 0,
      writeMs: 0,
      loopMs: 0,
      effectiveBlocksPerSecond: 0,
      rpcRetries: 0,
      confirmMode: 'fixed-lag',
      confirmLagBlocks: 64,
      liveLagBlocks: 0n,
    });
    expect(notes).toContain('caught up');
    expect(notes).toContain('behindTargetBlocks=0');
    expect(notes).toContain('confirmLagBlocks=64');
  });

  it('computes sensible blocks/sec', () => {
    expect(computeEffectiveBlocksPerSecond({ blocksSpanned: 512, loopMs: 1000 })).toBe(
      512,
    );
    expect(computeEffectiveBlocksPerSecond({ blocksSpanned: 0, loopMs: 1000 })).toBe(0);
    expect(computeEffectiveBlocksPerSecond({ blocksSpanned: 100, loopMs: 0 })).toBe(0);
  });
});
