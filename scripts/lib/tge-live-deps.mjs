/**
 * Production dependency wiring for TGE finalizer --confirm.
 * Construct only for confirmed execution. Never log private keys.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import pg from 'pg';
import {
  HOODLOCK_LOCKER_ADDRESS,
  ROBINHOOD_CHAIN_ID,
  SCOOP_FACTORY_ADDRESS,
} from './tge-constants.mjs';
import {
  hoodlockLockerAbi,
  loadHoodlockLocksForOwnerToken,
  readErc20AllowanceBalance,
  verifyHoodlockDeployment,
} from './hoodlock.mjs';
import { detectDevAllocationOnChain } from './tge-dev-allocation.mjs';
import {
  ensureOfficialTapeRegistered,
  readOfficialTapeContract,
} from './tge-official-tape-db.mjs';
import { sanitizeSignerError } from './tge-signer-env.mjs';

export const robinhoodChain = {
  id: ROBINHOOD_CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
};

/**
 * @param {{
 *   rpcUrl: string,
 *   databaseUrl: string,
 *   privateKey: `0x${string}`,
 *   configuredExpectedWallet?: string | null,
 * }} args
 */
export function buildLiveTgeFinalizeDeps(args) {
  const account = privateKeyToAccount(args.privateKey);
  const transport = http(args.rpcUrl);
  const publicClient = createPublicClient({
    chain: { ...robinhoodChain, rpcUrls: { default: { http: [args.rpcUrl] } } },
    transport,
  });
  const walletClient = createWalletClient({
    account,
    chain: { ...robinhoodChain, rpcUrls: { default: { http: [args.rpcUrl] } } },
    transport,
  });

  /** @type {import('pg').Client | null} */
  let pgClient = null;

  async function getPg() {
    if (pgClient) return pgClient;
    pgClient = new pg.Client({ connectionString: args.databaseUrl });
    await pgClient.connect();
    return pgClient;
  }

  return {
    account: { address: account.address },
    configuredExpectedWallet: args.configuredExpectedWallet ?? null,
    async dispose() {
      if (pgClient) {
        await pgClient.end().catch(() => {});
        pgClient = null;
      }
    },
    db: {
      async readOfficial() {
        const client = await getPg();
        return readOfficialTapeContract(client);
      },
      async ensureRegistered(candidate) {
        const client = await getPg();
        return ensureOfficialTapeRegistered({
          client,
          candidate,
          allowOverride: false,
        });
      },
      async rereadOfficial() {
        const client = await getPg();
        return readOfficialTapeContract(client);
      },
    },
    getChainId: async () => publicClient.getChainId(),
    verifyHoodlock: async () =>
      verifyHoodlockDeployment({ client: publicClient }),
    getInitialBuyEvents: async (tape) => {
      const detected = await detectDevAllocationOnChain({
        client: publicClient,
        factory: SCOOP_FACTORY_ADDRESS,
        tapeAddress: tape,
        expectedWallet: args.configuredExpectedWallet,
      });
      return detected.events ?? [];
    },
    getAllowanceBalance: async ({ token, owner, spender }) =>
      readErc20AllowanceBalance({
        client: publicClient,
        token,
        owner,
        spender,
      }),
    loadLocks: async ({ owner, token }) =>
      loadHoodlockLocksForOwnerToken({
        client: publicClient,
        owner,
        token,
        locker: HOODLOCK_LOCKER_ADDRESS,
      }),
    getBlockTimestamp: async () => {
      const block = await publicClient.getBlock({ blockTag: 'latest' });
      return Number(block.timestamp);
    },
    simulateApproval: async (intent) => {
      try {
        await publicClient.call({
          account: account.address,
          to: intent.to,
          data: intent.data,
          value: intent.value ?? 0n,
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: `BLOCKED — APPROVAL SIMULATION FAILED (${sanitizeSignerError(error)})`,
        };
      }
    },
    sendApproval: async (intent) => {
      const hash = await walletClient.sendTransaction({
        to: intent.to,
        data: intent.data,
        value: intent.value ?? 0n,
        chain: walletClient.chain,
        account,
      });
      return { hash };
    },
    waitReceipt: async (hash) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs,
      };
    },
    simulateLock: async (intent) => {
      try {
        await publicClient.call({
          account: account.address,
          to: intent.to,
          data: intent.data,
          value: intent.value,
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: `BLOCKED — HOODLOCK LOCK SIMULATION FAILED (${sanitizeSignerError(error)})`,
        };
      }
    },
    sendLock: async (intent) => {
      const hash = await walletClient.sendTransaction({
        to: intent.to,
        data: intent.data,
        value: intent.value,
        chain: walletClient.chain,
        account,
      });
      return { hash };
    },
    getBlockByNumber: async (n) => {
      const block = await publicClient.getBlock({ blockNumber: BigInt(n) });
      return { timestamp: block.timestamp };
    },
    readLock: async (id) => {
      const row = /** @type {[string, string, bigint, bigint, boolean]} */ (
        await publicClient.readContract({
          address: getAddress(HOODLOCK_LOCKER_ADDRESS),
          abi: hoodlockLockerAbi,
          functionName: 'locks',
          args: [id],
        })
      );
      return {
        owner: getAddress(row[0]),
        token: getAddress(row[1]),
        amount: row[2],
        unlockTime: row[3],
        withdrawn: row[4],
      };
    },
  };
}
