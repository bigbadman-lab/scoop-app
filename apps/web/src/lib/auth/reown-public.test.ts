import { describe, expect, it } from 'vitest';
import {
  getReownProjectId,
  hasWagmiReconnectHint,
  isReownConfigured,
  scoopReownConfigured,
  shortenWalletAddress,
} from '@/lib/auth/reown-public';

describe('reown-public (light shell flags)', () => {
  it('reads explicit env without ambient process.env', () => {
    expect(
      getReownProjectId({
        NEXT_PUBLIC_REOWN_PROJECT_ID: '',
      } as NodeJS.ProcessEnv),
    ).toBe('');
    expect(
      isReownConfigured({
        NEXT_PUBLIC_REOWN_PROJECT_ID: '  abc  ',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('shortens wallet addresses', () => {
    expect(shortenWalletAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
      '0xd8dA…6045',
    );
  });

  it('detects wagmi cookie reconnect hints', () => {
    expect(hasWagmiReconnectHint(null)).toBe(false);
    expect(hasWagmiReconnectHint('session=1')).toBe(false);
    expect(hasWagmiReconnectHint('wagmi.store=1')).toBe(true);
    expect(hasWagmiReconnectHint('foo=1; wagmi.account=0x')).toBe(true);
  });

  it('exposes module configured bit as boolean', () => {
    expect(typeof scoopReownConfigured).toBe('boolean');
  });
});
