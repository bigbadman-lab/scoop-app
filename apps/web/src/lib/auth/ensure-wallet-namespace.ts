/**
 * Ensure AppKit's active chain matches the connect namespace before headless
 * connect / WC URI generation. Without this, Solana sheet clicks fall through
 * to connectWalletConnect() while activeChain is still eip155 — Phantom then
 * rejects with "trying to use Ethereum".
 */

import {
  ChainController,
  ConnectorController,
} from '@reown/appkit-controllers';
import type { ScoopWalletNamespace } from '@/lib/auth/wallet-namespace';

export async function ensureActiveWalletNamespace(
  namespace: ScoopWalletNamespace,
): Promise<void> {
  ConnectorController.setFilterByNamespace(namespace);

  if (ChainController.state.activeChain === namespace) {
    return;
  }

  try {
    await ChainController.switchActiveNamespace(namespace);
  } catch {
    // switchActiveNetwork can fail if no wallet is connected yet; still pin
    // activeChain so WC / connectExternal use the Solana adapter.
    ChainController.setActiveNamespace(namespace);
  }

  if (ChainController.state.activeChain !== namespace) {
    ChainController.setActiveNamespace(namespace);
  }
}
