import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CREATOR_FEE_BPS,
  creatorFeeLabel,
  isPublicCreatorFeeBps,
} from '@/lib/launch/creator-fee';
import { createInitialLaunchState } from '@/lib/launch/types';
import { validateDevBuyStep } from '@/lib/launch/validation';

describe('public creator fee', () => {
  it('maps 1% and 2% and rejects every other value', () => {
    expect(DEFAULT_CREATOR_FEE_BPS).toBe(100);
    expect(creatorFeeLabel(100)).toBe('1%');
    expect(creatorFeeLabel(200)).toBe('2%');
    expect(isPublicCreatorFeeBps(100)).toBe(true);
    expect(isPublicCreatorFeeBps(200)).toBe(true);
    expect(isPublicCreatorFeeBps(0)).toBe(false);
    expect(isPublicCreatorFeeBps(50)).toBe(false);
    expect(isPublicCreatorFeeBps(1000)).toBe(false);
    expect(createInitialLaunchState().creatorFeeBps).toBe(100);
  });

  it('rejects a non-public fee at the launch validation boundary', () => {
    const state = createInitialLaunchState();
    state.devBuyAmount = '0.01';
    state.creatorFeeBps = 0 as never;
    expect(validateDevBuyStep(state).creatorFeeBps).toMatch(/1% or 2%/);
  });
});
