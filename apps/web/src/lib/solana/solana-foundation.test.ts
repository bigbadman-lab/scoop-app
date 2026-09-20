import { describe, expect, it } from 'vitest';
import {
  isSolanaAppKitNetwork,
  SOLANA_CAIP_NETWORK_ID,
  SOLANA_CLUSTER,
  solanaAppKitNetwork,
} from '@/lib/solana/networks';
import { isSolanaPublicKeyString, parseSolanaPublicKey } from '@/lib/solana/pubkey';
import {
  isSolanaRpcConfigured,
  resolveSolanaRpcUrl,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';
import { isScoopSolanaWalletProbeEnabled } from '@/lib/solana/wallet-probe';
import {
  scoopAppKitNetworks,
  scoopSolanaAdapter,
  scoopWagmiAdapter,
  scoopWagmiNetworks,
} from '@/lib/auth/wagmi-config';
import { robinhoodAppKitChain } from '@/lib/auth/chain';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

describe('Solana AppKit network', () => {
  it('is mainnet-beta solana namespace only', () => {
    expect(SOLANA_CLUSTER).toBe('mainnet-beta');
    expect(solanaAppKitNetwork.chainNamespace).toBe('solana');
    expect(solanaAppKitNetwork.caipNetworkId).toBe(SOLANA_CAIP_NETWORK_ID);
    expect(isSolanaAppKitNetwork(solanaAppKitNetwork)).toBe(true);
    expect(isSolanaAppKitNetwork(robinhoodAppKitChain)).toBe(false);
  });
});

describe('Solana public key parsing', () => {
  it('accepts a valid base58 pubkey and rejects EVM hex', () => {
    const system = '11111111111111111111111111111111';
    expect(isSolanaPublicKeyString(system)).toBe(true);
    expect(parseSolanaPublicKey(system)?.toBase58()).toBe(system);
    expect(
      isSolanaPublicKeyString('0x0000000000000000000000000000000000000001'),
    ).toBe(false);
    expect(parseSolanaPublicKey('not-a-key')).toBeNull();
  });
});

describe('Solana RPC config', () => {
  it('requires SOLANA_RPC_URL and rejects empty / non-https', () => {
    expect(isSolanaRpcConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(() => resolveSolanaRpcUrl({} as NodeJS.ProcessEnv)).toThrow(
      SolanaRpcConfigError,
    );
    expect(() =>
      resolveSolanaRpcUrl({ SOLANA_RPC_URL: 'http://localhost' } as NodeJS.ProcessEnv),
    ).toThrow(/https/i);
    expect(
      resolveSolanaRpcUrl({
        SOLANA_RPC_URL: 'https://example.invalid/solana',
      } as NodeJS.ProcessEnv),
    ).toBe('https://example.invalid/solana');
  });
});

describe('Solana wallet probe flag', () => {
  it('is off by default and on only for =1', () => {
    expect(isScoopSolanaWalletProbeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isScoopSolanaWalletProbeEnabled({
        NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});

describe('AppKit dual-adapter config (Robinhood preserved)', () => {
  it('keeps Wagmi on Robinhood 4663 only and AppKit includes Solana', () => {
    expect(scoopWagmiNetworks).toHaveLength(1);
    expect(scoopWagmiNetworks[0].id).toBe(ROBINHOOD_CHAIN_ID);
    expect(scoopAppKitNetworks.map((n) => n.chainNamespace)).toEqual([
      'eip155',
      'solana',
    ]);
    // When project id is present in test env, both adapters exist; otherwise both null.
    expect(Boolean(scoopWagmiAdapter)).toBe(Boolean(scoopSolanaAdapter));
  });
});
