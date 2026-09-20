import { cookieStorage, createStorage } from 'wagmi';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { getReownProjectId, robinhoodAppKitChain } from '@/lib/auth/chain';
import { buildRobinhoodCustomRpcUrls } from '@/lib/auth/reown-rpc';
import { solanaAppKitNetwork } from '@/lib/solana/networks';

/**
 * Lazy wallet boundary only — do not import from the anonymous public shell.
 * Project ID via static NEXT_PUBLIC_ access (C.1a).
 *
 * WagmiAdapter stays EVM/Robinhood-only.
 * SolanaAdapter is a sibling AppKit adapter (Gate B) — not routed through Wagmi.
 */
const projectId = getReownProjectId();
const customRpcUrls = buildRobinhoodCustomRpcUrls();

/** EVM networks only — safe for WagmiAdapter. */
export const scoopWagmiNetworks = [robinhoodAppKitChain] as [
  typeof robinhoodAppKitChain,
  ...typeof robinhoodAppKitChain[],
];

/** AppKit multimodal networks: Robinhood (eip155) + Solana mainnet. */
export const scoopAppKitNetworks = [robinhoodAppKitChain, solanaAppKitNetwork] as [
  typeof robinhoodAppKitChain,
  typeof solanaAppKitNetwork,
  ...(typeof robinhoodAppKitChain | typeof solanaAppKitNetwork)[],
];

export const scoopCustomRpcUrls = customRpcUrls;

export const scoopWagmiAdapter: WagmiAdapter | null = projectId
  ? new WagmiAdapter({
      storage: createStorage({ storage: cookieStorage }),
      ssr: true,
      projectId,
      networks: scoopWagmiNetworks,
      customRpcUrls,
    })
  : null;

export const scoopSolanaAdapter: SolanaAdapter | null = projectId
  ? new SolanaAdapter()
  : null;

export const scoopReownProjectId = projectId;

/** Adapter bootstrapped for this instance (lazy module). */
export const scoopWalletRuntimeConfigured = Boolean(
  scoopWagmiAdapter && scoopSolanaAdapter && scoopReownProjectId,
);
