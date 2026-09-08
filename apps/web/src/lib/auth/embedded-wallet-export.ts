import {
  isReownAuthConnectorId,
  REOWN_AUTH_CONNECTOR_ID,
  type ScoopSiweWalletType,
} from '@/lib/auth/wallet-origin';

/**
 * Open Reown's secure embedded-wallet export/self-custody flow.
 * SCOOP never receives private-key or mnemonic material.
 */

export const EMBEDDED_WALLET_EXPORT_ERROR =
  "We couldn't open wallet export right now. Try again in a moment.";

export type EmbeddedExportAvailability = 'hidden' | 'ready' | 'reconnect';

export { REOWN_AUTH_CONNECTOR_ID };

export function resolveEmbeddedExportAvailability(input: {
  walletType: ScoopSiweWalletType;
  sessionOnly: boolean;
  connectorId: string | null | undefined;
  /** Live AppKit signal — covers accounts still stored as external. */
  hasEmbeddedWalletInfo?: boolean;
}): EmbeddedExportAvailability {
  const liveEmbedded =
    isReownAuthConnectorId(input.connectorId) ||
    Boolean(input.hasEmbeddedWalletInfo);
  const embedded = input.walletType === 'embedded' || liveEmbedded;
  if (!embedded) return 'hidden';
  if (input.sessionOnly || !liveEmbedded) return 'reconnect';
  return 'ready';
}

export type OpenEmbeddedWalletExportResult = 'upgrade' | 'account' | 'error';

/**
 * Prefer UpgradeEmailWallet (ModalController); fall back to public Account view.
 * Injectable for tests — production uses openEmbeddedWalletExportViaAppKit.
 */
export async function openEmbeddedWalletExport(deps: {
  openUpgradeView: () => void | Promise<void>;
  openAccountView: () => void | Promise<void>;
}): Promise<OpenEmbeddedWalletExportResult> {
  try {
    await deps.openUpgradeView();
    return 'upgrade';
  } catch {
    // Fall through to public Account view.
  }

  try {
    await deps.openAccountView();
    return 'account';
  } catch {
    return 'error';
  }
}

/** Production entry: ModalController → Account fallback. */
export async function openEmbeddedWalletExportViaAppKit(
  openAccountView: () => void | Promise<void>,
): Promise<OpenEmbeddedWalletExportResult> {
  return openEmbeddedWalletExport({
    openUpgradeView: async () => {
      const { ModalController } = await import('@reown/appkit-controllers');
      await ModalController.open({ view: 'UpgradeEmailWallet' });
    },
    openAccountView,
  });
}
