import { cookieStorage, createStorage } from 'wagmi';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getReownProjectId, robinhoodAppKitChain } from '@/lib/auth/chain';
import { buildRobinhoodCustomRpcUrls } from '@/lib/auth/reown-rpc';

/**
 * Lazy wallet boundary only — do not import from the anonymous public shell.
 * Project ID via static NEXT_PUBLIC_ access (C.1a).
 */
const projectId = getReownProjectId();
const customRpcUrls = buildRobinhoodCustomRpcUrls();

export const scoopAppKitNetworks = [robinhoodAppKitChain] as [
  typeof robinhoodAppKitChain,
  ...typeof robinhoodAppKitChain[],
];

export const scoopCustomRpcUrls = customRpcUrls;

export const scoopWagmiAdapter: WagmiAdapter | null = projectId
  ? new WagmiAdapter({
      storage: createStorage({ storage: cookieStorage }),
      ssr: true,
      projectId,
      networks: scoopAppKitNetworks,
      customRpcUrls,
    })
  : null;

export const scoopReownProjectId = projectId;

/** Adapter bootstrapped for this instance (lazy module). */
export const scoopWalletRuntimeConfigured = Boolean(
  scoopWagmiAdapter && scoopReownProjectId,
);
