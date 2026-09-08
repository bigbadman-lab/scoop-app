/**
 * Classify Reown AUTH / email embedded wallets for SIWE metadata + account UX.
 */

export type ScoopSiweWalletType = 'embedded' | 'external';
export type ScoopSiweWalletProvider =
  | 'injected'
  | 'walletconnect'
  | 'reown_email'
  | 'auth'
  | 'unknown';

export const REOWN_AUTH_CONNECTOR_ID = 'AUTH';

export function isReownAuthConnectorId(
  connectorId: string | null | undefined,
): boolean {
  return connectorId === REOWN_AUTH_CONNECTOR_ID;
}

export function resolveSiweWalletMeta(input: {
  connectorId?: string | null;
  embeddedWalletInfo?: {
    authProvider?: string | null;
  } | null;
}): {
  walletType: ScoopSiweWalletType;
  provider: ScoopSiweWalletProvider;
} {
  const authProvider = input.embeddedWalletInfo?.authProvider ?? null;
  const isEmbedded =
    isReownAuthConnectorId(input.connectorId) || Boolean(input.embeddedWalletInfo);

  if (!isEmbedded) {
    return { walletType: 'external', provider: 'unknown' };
  }

  if (authProvider === 'email') {
    return { walletType: 'embedded', provider: 'reown_email' };
  }

  return { walletType: 'embedded', provider: 'auth' };
}

/** Account export / embedded chrome: DB type OR live AUTH/embedded signal. */
export function isEmbeddedWalletAccount(input: {
  storedWalletType: ScoopSiweWalletType;
  connectorId?: string | null;
  hasEmbeddedWalletInfo?: boolean;
}): boolean {
  if (input.storedWalletType === 'embedded') return true;
  if (isReownAuthConnectorId(input.connectorId)) return true;
  if (input.hasEmbeddedWalletInfo) return true;
  return false;
}
