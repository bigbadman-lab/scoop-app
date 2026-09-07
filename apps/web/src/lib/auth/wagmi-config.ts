import { cookieStorage, createStorage } from 'wagmi';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { getReownProjectId, robinhoodAppKitChain } from '@/lib/auth/chain';

/**
 * Lazy wallet boundary only — do not import from the anonymous public shell.
 * Project ID via static NEXT_PUBLIC_ access (C.1a).
 */
const projectId = getReownProjectId();

export const scoopAppKitNetworks = [robinhoodAppKitChain] as [
  typeof robinhoodAppKitChain,
  ...typeof robinhoodAppKitChain[],
];

export const scoopWagmiAdapter: WagmiAdapter | null = projectId
  ? new WagmiAdapter({
      storage: createStorage({ storage: cookieStorage }),
      ssr: true,
      projectId,
      networks: scoopAppKitNetworks,
    })
  : null;

export const scoopReownProjectId = projectId;

/** Adapter bootstrapped for this instance (lazy module). */
export const scoopWalletRuntimeConfigured = Boolean(
  scoopWagmiAdapter && scoopReownProjectId,
);
