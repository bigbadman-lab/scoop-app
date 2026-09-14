import { describe, expect, it } from 'vitest';
import {
  isScoopMobileAuthViewport,
  shouldPreferMobileWcOpenOverQr,
  shouldPrefetchWcUriBeforeConnect,
} from '@/lib/auth/mobile-wallet-connect';

describe('isScoopMobileAuthViewport', () => {
  it('treats narrow widths as mobile', () => {
    expect(isScoopMobileAuthViewport({ width: 375 })).toBe(true);
    expect(isScoopMobileAuthViewport({ width: 430 })).toBe(true);
    expect(isScoopMobileAuthViewport({ width: 1280 })).toBe(false);
  });

  it('detects mobile user agents', () => {
    expect(
      isScoopMobileAuthViewport({
        width: 1024,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      }),
    ).toBe(true);
  });
});

describe('shouldPrefetchWcUriBeforeConnect', () => {
  it('prefeches on mobile for non-injected wallets', () => {
    expect(
      shouldPrefetchWcUriBeforeConnect({
        isMobile: true,
        wallet: { id: 'trust', isInjected: false },
      }),
    ).toBe(true);
  });

  it('skips prefetch for injected or desktop', () => {
    expect(
      shouldPrefetchWcUriBeforeConnect({
        isMobile: true,
        wallet: { id: 'mm', isInjected: true },
      }),
    ).toBe(false);
    expect(
      shouldPrefetchWcUriBeforeConnect({
        isMobile: false,
        wallet: { id: 'trust', isInjected: false },
      }),
    ).toBe(false);
  });
});

describe('shouldPreferMobileWcOpenOverQr', () => {
  it('prefers open/deeplink on mobile when URI exists', () => {
    expect(
      shouldPreferMobileWcOpenOverQr({ isMobile: true, hasWcUri: true }),
    ).toBe(true);
    expect(
      shouldPreferMobileWcOpenOverQr({ isMobile: false, hasWcUri: true }),
    ).toBe(false);
  });
});
