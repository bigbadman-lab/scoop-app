import { describe, expect, it, vi } from 'vitest';
import { validateFeeKeeperMarket } from './validate.js';
import { classifyError, isBenignZeroBalanceMessage } from './errors.js';
import { assertWritesAllowed, resolveWriteGate } from './clients.js';
import { runFeeKeeper } from './run.js';
import type { FeeKeeperMarket } from '@scoop/db';
import type { LoadedFeeKeeperConfig } from './config.js';
import { zeroAddress } from 'viem';

const market: FeeKeeperMarket = {
  chainId: 4663,
  tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
  quoteAsset: zeroAddress,
  poolId: '0x1111111111111111111111111111111111111111111111111111111111111111',
  lpTokenId: '2004846',
  liquidityLocker: '0xAa8445659A2424ee1BA33C232Ec05569c975193f',
  feeDistributor: '0x187E2c017bcc52094A9086abAC94Dde7B680a988',
  creatorId: '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef',
  deployer: '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
  launchTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  launchedAt: 1_700_000_000,
  lastTradeAt: 1_700_000_000,
};

describe('validateFeeKeeperMarket', () => {
  it('accepts canonical row', () => {
    expect(validateFeeKeeperMarket(market).ok).toBe(true);
  });

  it('skips malformed locker', () => {
    const v = validateFeeKeeperMarket({
      ...market,
      liquidityLocker: zeroAddress,
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe('malformed_market');
  });

  it('skips lpTokenId 0', () => {
    const v = validateFeeKeeperMarket({ ...market, lpTokenId: '0' });
    expect(v.ok).toBe(false);
  });
});

describe('classifyError', () => {
  it('maps wrong_chain to FATAL', () => {
    expect(classifyError({ code: 'wrong_chain' }).errorClass).toBe('FATAL');
  });

  it('maps ZeroBalance race as benign detector', () => {
    expect(isBenignZeroBalanceMessage('execution reverted: ZeroBalance()')).toBe(
      true,
    );
    expect(classifyError({ code: 'zero_balance_race' }).errorClass).toBe('SKIP');
  });
});

describe('write gate', () => {
  it('resolveWriteGate disabled without wallet', () => {
    const gate = resolveWriteGate({
      publicClient: {} as never,
      walletClient: null,
      keeperAddress: null,
    });
    expect(gate.enabled).toBe(false);
    expect(() => assertWritesAllowed(gate)).toThrow(/WRITE_GATE/);
  });
});

describe('runFeeKeeper dry-run isolation', () => {
  it('lock unavailable exits without servicing and without writes', async () => {
    const listMarkets = vi.fn(async () => [market]);
    const result = await runFeeKeeper({
      loadConfig: () =>
        ({
          writeEnabled: false,
          mode: 'dry-run',
          chainId: 4663,
          rpcUrl: 'https://example.invalid',
          databaseUrl: 'postgres://x',
          lockDatabaseUrl: 'postgres://x',
          activityLookbackMinutes: 120,
          fallbackSweepMinutes: 1440,
          expectedKeeperAddress: null,
          privateKey: null,
          lowBalanceWeiWarning: 10n ** 15n,
        }) satisfies LoadedFeeKeeperConfig,
      acquireLock: async () => ({ ok: false, reason: 'unavailable' }),
      listMarkets,
    });
    expect(result.exitCode).toBe(0);
    expect(result.writesAttempted).toBe(false);
    expect(result.transactionsSent).toBe(0);
    expect(listMarkets).not.toHaveBeenCalled();
  });
});
