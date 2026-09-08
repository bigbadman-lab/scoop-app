import { describe, expect, it } from 'vitest';
import {
  bustAvatarCacheUrl,
  fallbackAvatarDataUrl,
  resolveAvatarUrl,
} from '@/lib/account/avatar';
import { resolveOnChainWalletCapability } from '@/lib/account/onchain-policy';
import { profileAvatarPath } from '@/lib/account/avatar-path';

describe('fallback avatar', () => {
  it('is deterministic for the same userId', () => {
    const a = fallbackAvatarDataUrl('11111111-1111-1111-1111-111111111111', 'Ada');
    const b = fallbackAvatarDataUrl('11111111-1111-1111-1111-111111111111', 'Ada');
    expect(a).toBe(b);
    expect(a.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });

  it('fills a square (no circular rx) so sidebar chrome has no white corners', () => {
    const data = fallbackAvatarDataUrl('11111111-1111-1111-1111-111111111111', 'S');
    const svg = Buffer.from(data.replace('data:image/svg+xml;base64,', ''), 'base64').toString(
      'utf8',
    );
    expect(svg).toContain('<rect width="96" height="96" fill=');
    expect(svg).not.toMatch(/rx="/);
  });

  it('prefers signed avatar url when present', () => {
    expect(
      resolveAvatarUrl({
        userId: '11111111-1111-1111-1111-111111111111',
        signedAvatarUrl: 'https://signed.example/a.png',
      }),
    ).toBe('https://signed.example/a.png');
  });

  it('applies cache version to signed avatar urls', () => {
    expect(
      resolveAvatarUrl({
        userId: '11111111-1111-1111-1111-111111111111',
        signedAvatarUrl: 'https://signed.example/a.png?token=1',
        cacheVersion: 42,
      }),
    ).toBe('https://signed.example/a.png?token=1&v=42');
  });
});

describe('bustAvatarCacheUrl', () => {
  it('leaves data URLs untouched', () => {
    const data = 'data:image/svg+xml;base64,abc';
    expect(bustAvatarCacheUrl(data, 1)).toBe(data);
  });

  it('replaces prior v param so replacement avatars are not stale', () => {
    expect(bustAvatarCacheUrl('https://cdn.example/a.png?v=1', 2)).toBe(
      'https://cdn.example/a.png?v=2',
    );
    expect(bustAvatarCacheUrl('https://cdn.example/a.png?token=x&v=1', 9)).toBe(
      'https://cdn.example/a.png?token=x&v=9',
    );
  });
});

describe('avatar path ownership', () => {
  it('derives path from userId only', () => {
    expect(profileAvatarPath('11111111-1111-1111-1111-111111111111', 'image/png')).toBe(
      '11111111-1111-1111-1111-111111111111/avatar.png',
    );
  });

  it('rejects non-uuid user ids', () => {
    expect(() => profileAvatarPath('not-a-user', 'image/png')).toThrow(/INVALID_USER_ID/);
  });
});

describe('on-chain wallet capability', () => {
  it('allows external authenticated wallets', () => {
    expect(
      resolveOnChainWalletCapability({
        authenticated: true,
        walletType: 'external',
      }).mayBroadcastOnChain,
    ).toBe(true);
  });

  it('blocks embedded email wallets from on-chain broadcast', () => {
    const result = resolveOnChainWalletCapability({
      authenticated: true,
      walletType: 'embedded',
    });
    expect(result.mayBroadcastOnChain).toBe(false);
    expect(result.message).toMatch(/external wallet/i);
  });
});
