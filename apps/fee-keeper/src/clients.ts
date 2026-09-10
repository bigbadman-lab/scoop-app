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
import type { LoadedFeeKeeperConfig } from './config.js';

/** Robinhood Chain minimal definition for viem. */
export const robinhoodChain = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
} as const satisfies Chain;

export type FeeKeeperClients = {
  publicClient: PublicClient<Transport, Chain>;
  /** Null in dry-run — write paths must refuse. */
  walletClient: WalletClient<Transport, Chain, Account> | null;
  keeperAddress: Address | null;
};

export function createFeeKeeperClients(config: LoadedFeeKeeperConfig): FeeKeeperClients {
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport,
  });

  if (!config.writeEnabled || !config.privateKey) {
    return {
      publicClient,
      walletClient: null,
      keeperAddress: config.expectedKeeperAddress,
    };
  }

  const account = privateKeyToAccount(config.privateKey);
  const walletClient = createWalletClient({
    account,
    chain: robinhoodChain,
    transport,
  });

  return {
    publicClient,
    walletClient,
    keeperAddress: account.address,
  };
}

export async function assertRpcChainId(
  publicClient: PublicClient,
  expected: number,
): Promise<void> {
  const id = await publicClient.getChainId();
  if (id !== expected) {
    throw Object.assign(new Error(`wrong_chain: rpc returned ${id}, expected ${expected}`), {
      code: 'wrong_chain',
    });
  }
}

export async function getNativeBalance(
  publicClient: PublicClient,
  address: Address,
): Promise<bigint> {
  return publicClient.getBalance({ address });
}

export type WriteGate =
  | { enabled: false }
  | {
      enabled: true;
      walletClient: WalletClient<Transport, Chain, Account>;
      account: Address;
    };

/**
 * Hard write gate. Dry-run / disabled ⇒ enabled false.
 * Callers MUST check before any sendTransaction / writeContract.
 */
export function resolveWriteGate(clients: FeeKeeperClients): WriteGate {
  if (!clients.walletClient || !clients.keeperAddress) {
    return { enabled: false };
  }
  return {
    enabled: true,
    walletClient: clients.walletClient,
    account: clients.keeperAddress,
  };
}

/** Throws if a write is attempted while gated off. */
export function assertWritesAllowed(gate: WriteGate): asserts gate is Extract<
  WriteGate,
  { enabled: true }
> {
  if (!gate.enabled) {
    throw new Error('WRITE_GATE: send path blocked (SCOOP_FEE_KEEPER_WRITE_ENABLED=false)');
  }
}

type LocalWriteRequest = Parameters<
  WalletClient<Transport, Chain, Account>['writeContract']
>[0];

/**
 * Broadcast via LocalAccount signing → eth_sendRawTransaction.
 * Alchemy (and similar hosted RPCs) reject eth_sendTransaction; never rely on
 * an unlocked remote account. Always override request.account with the hoisted
 * LocalAccount so simulateContract's address-only account cannot downgrade the path.
 */
export async function writeContractLocal(
  gate: Extract<WriteGate, { enabled: true }>,
  /** simulateContract request union is wider than writeContract params; override account below. */
  request: object,
): Promise<Hash> {
  const account = gate.walletClient.account;
  if (!account || typeof account === 'string') {
    throw new Error(
      'WRITE_GATE: LocalAccount required (eth_sendRawTransaction); refusing address-only / JSON-RPC account',
    );
  }
  if (typeof (account as { signTransaction?: unknown }).signTransaction !== 'function') {
    throw new Error(
      'WRITE_GATE: account cannot signTransaction; refusing eth_sendTransaction fallback',
    );
  }
  return gate.walletClient.writeContract({
    ...(request as LocalWriteRequest),
    account,
    chain: gate.walletClient.chain,
  });
}

export type { Hex };
