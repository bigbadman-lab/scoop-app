import { describe, expect, it, vi } from 'vitest';
import { runFeeKeeper } from './run.js';
import type { FeeKeeperMarket } from '@scoop/db';
import type { LoadedFeeKeeperConfig } from './config.js';
import { zeroAddress, type PublicClient } from 'viem';

const good: FeeKeeperMarket = {
  chainId: 4663,
  tokenAddress: '0x2222222222222222222222222222222222222222',
  quoteAsset: zeroAddress,
  poolId: '0x2222222222222222222222222222222222222222222222222222222222222222',
  lpTokenId: '2',
  liquidityLocker: '0xAa8445659A2424ee1BA33C232Ec05569c975193f',
  feeDistributor: '0x187E2c017bcc52094A9086abAC94Dde7B680a988',
  holderRewards: null,
  additionalFee: 0,
  totalPoolFee: 10_000,
  creatorAllocationDestination: 0,
  additionalFeeDestination: 0,
  creatorId: '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
  deployer: '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
  launchTxHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  launchedAt: 2,
  lastTradeAt: 1_700_000_000,
};

const bad: FeeKeeperMarket = {
  ...good,
  tokenAddress: '0x1111111111111111111111111111111111111111',
  lpTokenId: '1',
  liquidityLocker: zeroAddress,
  launchTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  poolId: '0x1111111111111111111111111111111111111111111111111111111111111111',
};

const cfg = {
  writeEnabled: false,
  mode: 'dry-run' as const,
  chainId: 4663,
  deploymentMode: 'historical-test' as const,
  factoryAddress: '0x15e874bc667435ddbf2a67c0362701dc23c90833',
  rpcUrl: 'https://example.invalid',
  databaseUrl: 'postgres://x',
  lockDatabaseUrl: 'postgres://x',
  activityLookbackMinutes: 120,
  fallbackSweepMinutes: 1440,
  cronWindowMinutes: 15,
  expectedKeeperAddress: null,
  privateKey: null,
  lowBalanceWeiWarning: 10n ** 15n,
} satisfies LoadedFeeKeeperConfig;

function mockClients(): {
  publicClient: PublicClient;
  walletClient: null;
  keeperAddress: null;
} {
  return {
    publicClient: {
      getChainId: vi.fn(async () => 4663),
      getBalance: vi.fn(async () => 0n),
      readContract: vi.fn(async () => 0n),
      simulateContract: vi.fn(async () => ({ request: {} })),
    } as unknown as PublicClient,
    walletClient: null,
    keeperAddress: null,
  };
}

describe('runFeeKeeper multi-market isolation', () => {
  it('continues after a malformed market and never writes in dry-run', async () => {
    const release = vi.fn(async () => undefined);
    const result = await runFeeKeeper({
      loadConfig: () => cfg,
      acquireLock: async () => ({
        ok: true,
        lock: { client: {} as never, release },
      }),
      createClients: () => mockClients(),
      listMarkets: async () => [bad, good],
      nowSec: () => 1_700_000_000,
    });
    expect(release).toHaveBeenCalled();
    expect(result.exitCode).toBe(0);
    expect(result.writeEnabled).toBe(false);
    expect(result.writesAttempted).toBe(false);
    expect(result.transactionsSent).toBe(0);
    expect(result.marketsDiscovered).toBe(2);
    expect(result.marketsSkipped + result.marketsServiced + result.marketsFailed).toBe(
      2,
    );
    expect(result.marketsSkipped).toBeGreaterThanOrEqual(1);
  });

  it('FATAL wrong chain does not write', async () => {
    const release = vi.fn(async () => undefined);
    const clients = mockClients();
    (clients.publicClient.getChainId as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    const result = await runFeeKeeper({
      loadConfig: () => cfg,
      acquireLock: async () => ({
        ok: true,
        lock: { client: {} as never, release },
      }),
      createClients: () => clients,
      listMarkets: async () => [good],
    });
    expect(result.exitCode).toBe(2);
    expect(result.writesAttempted).toBe(false);
    expect(release).toHaveBeenCalled();
  });
});
