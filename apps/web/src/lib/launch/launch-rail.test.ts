import { describe, expect, it } from 'vitest';
import { createInitialLaunchState } from '@/lib/launch/types';
import {
  DEFAULT_LAUNCH_RAIL,
  isPonsRail,
  isPumpRail,
  launchRailLabel,
} from '@/lib/launch/launch-rail';
import {
  validatePumpRouteStep,
  validatePumpTokenLimits,
  validateTokenStep,
} from '@/lib/launch/validation';

describe('LaunchRail', () => {
  it('defaults to Robinhood → Pons', () => {
    const state = createInitialLaunchState();
    expect(state.launchRail).toEqual(DEFAULT_LAUNCH_RAIL);
    expect(isPonsRail(state.launchRail)).toBe(true);
    expect(isPumpRail(state.launchRail)).toBe(false);
    expect(launchRailLabel(state.launchRail)).toBe('Robinhood Chain → Pons');
  });

  it('survives PATCH when navigating wizard state', () => {
    const pump = createInitialLaunchState({
      launchRail: { chain: 'solana', provider: 'pump' },
      name: 'Alpha',
      ticker: 'ALPHA',
      step: 2,
    });
    expect(isPumpRail(pump.launchRail)).toBe(true);
    expect(pump.step).toBe(2);
    expect(launchRailLabel(pump.launchRail)).toBe('Solana → Pump.fun');
  });
});

describe('Pump public validation', () => {
  it('blocks 33-char Pump names without changing Pons META_LIMITS path', () => {
    const longName = 'A'.repeat(33);
    const pump = createInitialLaunchState({
      launchRail: { chain: 'solana', provider: 'pump' },
      name: longName,
      ticker: 'OK',
      description: 'desc',
      image: {
        ...createInitialLaunchState().image,
        previewUrl: 'blob:x',
        artworkStatus: 'ready',
        source: 'user',
      },
    });
    const errs = validateTokenStep(pump);
    expect(errs.name).toMatch(/Pump\.fun supports names up to 32/);

    const pons = createInitialLaunchState({
      name: longName,
      ticker: 'OK',
      description: 'desc',
      image: pump.image,
    });
    const ponsErrs = validateTokenStep(pons);
    expect(ponsErrs.name).toBeUndefined();
  });

  it('blocks invalid Solana wallet on Pump route step', () => {
    const state = createInitialLaunchState({
      launchRail: { chain: 'solana', provider: 'pump' },
    });
    expect(validatePumpRouteStep(state, null).wallet).toBeTruthy();
    expect(validatePumpRouteStep(state, '0xabc').wallet).toBeTruthy();
    expect(
      validatePumpRouteStep(
        state,
        '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4',
      ).wallet,
    ).toBeUndefined();
  });

  it('validatePumpTokenLimits is additive only', () => {
    const errs = validatePumpTokenLimits(
      createInitialLaunchState({ name: 'Short', ticker: 'TICK' }),
    );
    expect(errs).toEqual({});
  });
});
