import { describe, expect, it } from 'vitest';
import {
  scoopAppKitNetworks,
  scoopSolanaAdapter,
  scoopWalletRuntimeConfigured,
  scoopWagmiAdapter,
  scoopWagmiNetworks,
} from '@/lib/auth/wagmi-config';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

describe('wagmi-config (lazy runtime)', () => {
  it('exposes runtime configured flag that matches adapter presence', () => {
    expect(scoopWalletRuntimeConfigured).toBe(
      Boolean(scoopWagmiAdapter && scoopSolanaAdapter),
    );
  });

  it('keeps Wagmi EVM-only while AppKit lists Robinhood + Solana', () => {
    expect(scoopWagmiNetworks).toHaveLength(1);
    expect(scoopWagmiNetworks[0].id).toBe(ROBINHOOD_CHAIN_ID);
    expect(scoopAppKitNetworks).toHaveLength(2);
    expect(scoopAppKitNetworks[0].chainNamespace).toBe('eip155');
    expect(scoopAppKitNetworks[1].chainNamespace).toBe('solana');
  });
});
