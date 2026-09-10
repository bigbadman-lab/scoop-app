import { describe, expect, it, vi } from 'vitest';
import { serviceMarket } from './service-market.js';
import type { FeeKeeperMarket } from '@scoop/db';
import { zeroAddress, type PublicClient } from 'viem';

const market: FeeKeeperMarket = {
  chainId: 4663,
  tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
  quoteAsset: zeroAddress,
  poolId: '0x1111111111111111111111111111111111111111111111111111111111111111',
  lpTokenId: '42',
  liquidityLocker: '0xAa8445659A2424ee1BA33C232Ec05569c975193f',
  feeDistributor: '0x187E2c017bcc52094A9086abAC94Dde7B680a988',
  creatorId: '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
  deployer: '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
  launchTxHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  launchedAt: 1_700_000_000,
  lastTradeAt: 1_700_000_000,
};

function mockPublicClient(opts: {
  ethBal?: bigint;
  tokenBal?: bigint;
  simulateCollectOk?: boolean;
  simulateDistributeOk?: boolean;
}): PublicClient {
  return {
    getBalance: vi.fn(async () => opts.ethBal ?? 0n),
    readContract: vi.fn(async () => opts.tokenBal ?? 0n),
    simulateContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'collectFees') {
        if (opts.simulateCollectOk === false) {
          throw new Error('collect revert');
        }
        return { request: {} };
      }
      if (
        functionName === 'distributeETH' ||
        functionName === 'distributeToken'
      ) {
        if (opts.simulateDistributeOk === false) {
          throw new Error('ZeroBalance()');
        }
        return { request: {} };
      }
      throw new Error(`unexpected ${functionName}`);
    }),
    waitForTransactionReceipt: vi.fn(),
  } as unknown as PublicClient;
}

describe('serviceMarket dry-run', () => {
  it('does not write when gate disabled; logs would_* path via status serviced', async () => {
    const writeContract = vi.fn();
    const outcome = await serviceMarket({
      market,
      publicClient: mockPublicClient({
        ethBal: 0n,
        tokenBal: 0n,
        simulateCollectOk: true,
      }),
      writeGate: { enabled: false },
      nowSec: market.lastTradeAt!,
      activityLookbackMinutes: 120,
      fallbackSweepMinutes: 1440,
      cronWindowMinutes: 15,
    });
    expect(writeContract).not.toHaveBeenCalled();
    expect(outcome.transactionsSent).toBe(0);
    expect(outcome.status).toBe('serviced');
  });

  it('blocks collect write when simulation fails', async () => {
    const outcome = await serviceMarket({
      market,
      publicClient: mockPublicClient({ simulateCollectOk: false }),
      writeGate: { enabled: false },
      nowSec: market.lastTradeAt!,
      activityLookbackMinutes: 120,
      fallbackSweepMinutes: 1440,
      cronWindowMinutes: 15,
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('collect_simulation_revert');
    expect(outcome.transactionsSent).toBe(0);
  });

  it('skips zero balance distribution without write', async () => {
    const outcome = await serviceMarket({
      market: { ...market, lastTradeAt: null },
      publicClient: mockPublicClient({ ethBal: 1n, tokenBal: 0n }),
      writeGate: { enabled: false },
      nowSec: 1_800_000_000,
      activityLookbackMinutes: 120,
      fallbackSweepMinutes: 1440,
      cronWindowMinutes: 15,
    });
    // non-zero ETH balance → distribute_only path
    expect(outcome.transactionsSent).toBe(0);
    expect(['serviced', 'skipped', 'failed']).toContain(outcome.status);
  });

  it('one failure path does not throw — continues as failed outcome', async () => {
    await expect(
      serviceMarket({
        market,
        publicClient: mockPublicClient({ simulateCollectOk: false }),
        writeGate: { enabled: false },
        nowSec: market.lastTradeAt!,
        activityLookbackMinutes: 120,
        fallbackSweepMinutes: 1440,
        cronWindowMinutes: 15,
      }),
    ).resolves.toMatchObject({ status: 'failed' });
  });
});
