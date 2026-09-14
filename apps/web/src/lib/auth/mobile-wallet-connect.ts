/**
 * Mobile / WalletConnect decision helpers for SCOOP headless wallet connect.
 */

export type ScoopWalletConnectTarget = {
  id?: string;
  name?: string;
  isInjected?: boolean;
  walletInfo?: {
    deepLink?: string | null;
  };
};

export function isScoopMobileAuthViewport(
  input: {
    width?: number;
    userAgent?: string;
    maxTouchPoints?: number;
  } = {},
): boolean {
  const width =
    input.width ??
    (typeof window !== 'undefined' ? window.innerWidth : 1024);
  if (width > 0 && width < 768) return true;

  const ua =
    input.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;

  const touch =
    input.maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0);
  return touch > 1 && width > 0 && width < 1024;
}

/**
 * Reown requires a WC URI before mobile deeplink (onConnectMobile no-ops without it).
 * Prefetch via getWcUri on the same user gesture before connect().
 */
export function shouldPrefetchWcUriBeforeConnect(input: {
  isMobile: boolean;
  wallet: ScoopWalletConnectTarget;
}): boolean {
  if (!input.isMobile) return false;
  if (input.wallet.isInjected) return false;
  return true;
}

/** On mobile, QR is secondary — open/deeplink is primary once URI exists. */
export function shouldPreferMobileWcOpenOverQr(input: {
  isMobile: boolean;
  hasWcUri: boolean;
}): boolean {
  return input.isMobile && input.hasWcUri;
}
