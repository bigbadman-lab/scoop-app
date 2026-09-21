/**
 * Headless Solana/EVM wallet connect with correct AppKit namespace.
 * Prefer injected / WalletStandard connectors for Solana (Phantom) before
 * falling back to walletsApi.connect (which may WC on the wrong chain).
 */

import {
  ConnectorController,
  ConnectorControllerUtil,
} from '@reown/appkit-controllers';
import { ensureActiveWalletNamespace } from '@/lib/auth/ensure-wallet-namespace';
import type {
  ScoopWalletNamespace,
  ScoopWalletNamespaceItem,
} from '@/lib/auth/wallet-namespace';

type ConnectFn = (
  wallet: ScoopWalletNamespaceItem,
  namespace: ScoopWalletNamespace,
) => Promise<void>;

function normalizeWalletKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Resolve a Solana-namespace connector for a WalletGuide / injected item.
 * Matches by connector id, explorerId, or wallet name (Phantom WalletStandard).
 */
export function resolveNamespaceConnector(
  wallet: ScoopWalletNamespaceItem,
  namespace: ScoopWalletNamespace,
): { id: string; chain: string; type?: string; provider?: unknown } | undefined {
  const connectors = ConnectorController.getConnectors(namespace) as Array<{
    id: string;
    chain: string;
    name?: string;
    explorerId?: string;
    type?: string;
    provider?: unknown;
  }>;

  const walletId = normalizeWalletKey(wallet.id);
  const walletName = normalizeWalletKey(wallet.name);
  const fromItem = (wallet.connectors ?? []).find((c) => c.chain === namespace);

  const byId =
    ConnectorController.getConnector({
      id: fromItem?.id ?? wallet.id ?? '',
      namespace,
    }) ??
    (wallet.id
      ? ConnectorController.getConnector({ id: wallet.id, namespace })
      : undefined);

  if (byId) return byId;

  return connectors.find((c) => {
    const id = normalizeWalletKey(c.id);
    const explorer = normalizeWalletKey(c.explorerId);
    const name = normalizeWalletKey(c.name);
    if (walletId && (id === walletId || explorer === walletId)) return true;
    if (walletName && (name === walletName || id === walletName)) return true;
    if (walletName && name.includes(walletName)) return true;
    if (walletName && walletName.includes(name) && name.length >= 4) return true;
    return false;
  });
}

export async function connectScoopWallet(params: {
  wallet: ScoopWalletNamespaceItem;
  namespace: ScoopWalletNamespace;
  connect: ConnectFn;
}): Promise<void> {
  const { wallet, namespace, connect } = params;

  await ensureActiveWalletNamespace(namespace);

  if (namespace === 'solana') {
    const connector = resolveNamespaceConnector(wallet, 'solana');
    if (connector) {
      await ConnectorControllerUtil.connectExternal(connector as never);
      return;
    }
  }

  await connect(wallet, namespace);
}
