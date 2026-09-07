import { describe, expect, it } from 'vitest';
import {
  scoopWalletRuntimeConfigured,
  scoopWagmiAdapter,
} from '@/lib/auth/wagmi-config';

describe('wagmi-config (lazy runtime)', () => {
  it('exposes runtime configured flag that matches adapter presence', () => {
    expect(scoopWalletRuntimeConfigured).toBe(Boolean(scoopWagmiAdapter));
  });
});
