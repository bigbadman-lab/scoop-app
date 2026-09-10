/**
 * Holder-rewards viem clients — publisher and push wallets are separate roles.
 * Never reuse fee-keeper keys. Writes gated unless WRITE_ENABLED.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { LoadedHolderRewardsConfig } from './config.js';

export const robinhoodChain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
} as const satisfies Chain;

export type HolderRewardsClients = {
  publicClient: PublicClient<Transport, Chain>;
  publisherWallet: WalletClient<Transport, Chain, Account> | null;
  pushWallet: WalletClient<Transport, Chain, Account> | null;
  publisherAddress: Address | null;
  pushAddress: Address | null;
};

export function createHolderRewardsClients(
  config: LoadedHolderRewardsConfig,
): HolderRewardsClients {
  const transport = http(config.rpcUrl ?? undefined);
  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport,
  });

  if (!config.writeEnabled) {
    return {
      publicClient,
      publisherWallet: null,
      pushWallet: null,
      publisherAddress: config.expectedPublisherAddress,
      pushAddress: config.expectedPushAddress,
    };
  }

  let publisherWallet: WalletClient<Transport, Chain, Account> | null = null;
  let publisherAddress: Address | null = config.expectedPublisherAddress;
  if (config.publisherPrivateKey) {
    const account = privateKeyToAccount(config.publisherPrivateKey);
    publisherWallet = createWalletClient({
      account,
      chain: robinhoodChain,
      transport,
    });
    publisherAddress = account.address.toLowerCase() as Address;
  }

  let pushWallet: WalletClient<Transport, Chain, Account> | null = null;
  let pushAddress: Address | null = config.expectedPushAddress;
  if (config.pushPrivateKey) {
    const account = privateKeyToAccount(config.pushPrivateKey);
    pushWallet = createWalletClient({
      account,
      chain: robinhoodChain,
      transport,
    });
    pushAddress = account.address.toLowerCase() as Address;
  }

  return {
    publicClient,
    publisherWallet,
    pushWallet,
    publisherAddress,
    pushAddress,
  };
}

export async function assertRpcChainId(
  publicClient: PublicClient,
  expected: number,
): Promise<void> {
  const id = await publicClient.getChainId();
  if (id !== expected) {
    throw Object.assign(
      new Error(`wrong_chain: rpc returned ${id}, expected ${expected}`),
      { code: 'wrong_chain' },
    );
  }
}

export type PublishWriteGate =
  | { enabled: false }
  | {
      enabled: true;
      walletClient: WalletClient<Transport, Chain, Account>;
      account: Address;
    };

export type PushWriteGate =
  | { enabled: false }
  | {
      enabled: true;
      walletClient: WalletClient<Transport, Chain, Account>;
      account: Address;
    };

export function resolvePublishWriteGate(clients: HolderRewardsClients): PublishWriteGate {
  if (!clients.publisherWallet || !clients.publisherAddress) {
    return { enabled: false };
  }
  return {
    enabled: true,
    walletClient: clients.publisherWallet,
    account: clients.publisherAddress,
  };
}

export function resolvePushWriteGate(clients: HolderRewardsClients): PushWriteGate {
  if (!clients.pushWallet || !clients.pushAddress) {
    return { enabled: false };
  }
  return {
    enabled: true,
    walletClient: clients.pushWallet,
    account: clients.pushAddress,
  };
}

export function assertPublishAllowed(
  gate: PublishWriteGate,
): asserts gate is Extract<PublishWriteGate, { enabled: true }> {
  if (!gate.enabled) {
    throw new Error(
      'WRITE_GATE: publish blocked (SCOOP_HOLDER_REWARDS_WRITE_ENABLED=false)',
    );
  }
}

export function assertPushAllowed(
  gate: PushWriteGate,
): asserts gate is Extract<PushWriteGate, { enabled: true }> {
  if (!gate.enabled) {
    throw new Error(
      'WRITE_GATE: push blocked (SCOOP_HOLDER_REWARDS_WRITE_ENABLED=false)',
    );
  }
}

type LocalWriteRequest = Parameters<
  WalletClient<Transport, Chain, Account>['writeContract']
>[0];

export async function writeContractLocal(
  gate: Extract<PublishWriteGate | PushWriteGate, { enabled: true }>,
  request: object,
): Promise<Hash> {
  const account = gate.walletClient.account;
  if (!account || typeof account === 'string') {
    throw new Error(
      'WRITE_GATE: LocalAccount required (eth_sendRawTransaction)',
    );
  }
  if (
    typeof (account as { signTransaction?: unknown }).signTransaction !==
    'function'
  ) {
    throw new Error('WRITE_GATE: account cannot signTransaction');
  }
  return gate.walletClient.writeContract({
    ...(request as LocalWriteRequest),
    account,
    chain: gate.walletClient.chain,
  });
}

export type { Hex, Address, Hash };
