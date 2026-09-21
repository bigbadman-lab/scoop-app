import { describe, expect, it } from 'vitest';
import { resolveNewsLaunchRail } from '@/lib/launch/resolve-news-launch-rail';

describe('resolveNewsLaunchRail', () => {
  it('maps eip155 + siwe → pons', () => {
    expect(
      resolveNewsLaunchRail({
        authenticated: true,
        namespace: 'eip155',
        authMethod: 'siwe',
      }),
    ).toEqual({
      kind: 'pons',
      rail: { chain: 'robinhood', provider: 'pons' },
    });
  });

  it('maps solana + siws → pump', () => {
    expect(
      resolveNewsLaunchRail({
        authenticated: true,
        namespace: 'solana',
        authMethod: 'siws',
      }),
    ).toEqual({
      kind: 'pump',
      rail: { chain: 'solana', provider: 'pump' },
    });
  });

  it('requires sign-in when signed out', () => {
    expect(
      resolveNewsLaunchRail({
        authenticated: false,
        namespace: null,
        authMethod: null,
      }),
    ).toEqual({ kind: 'requires_sign_in' });
  });

  it('requires sign-in for mismatched namespace/method pairs', () => {
    expect(
      resolveNewsLaunchRail({
        authenticated: true,
        namespace: 'eip155',
        authMethod: 'siws',
      }),
    ).toEqual({ kind: 'requires_sign_in' });
    expect(
      resolveNewsLaunchRail({
        authenticated: true,
        namespace: 'solana',
        authMethod: 'siwe',
      }),
    ).toEqual({ kind: 'requires_sign_in' });
  });

  it('ignores address-shaped inputs — only session fields matter', () => {
    // No address in the API; ensure partial session cannot invent a rail.
    expect(
      resolveNewsLaunchRail({
        authenticated: true,
        namespace: null,
        authMethod: 'siwe',
      }),
    ).toEqual({ kind: 'requires_sign_in' });
  });
});
