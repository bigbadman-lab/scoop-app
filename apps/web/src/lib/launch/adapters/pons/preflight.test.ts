import { describe, expect, it, vi } from 'vitest';
import { runPonsPreflight } from './preflight';
import { PonsAdapterError } from './errors';
import { PONS_V2_CHAIN_ID } from './constants';

const creator = '0x1111111111111111111111111111111111111111' as const;

function mockClient(reads: Record<string, unknown>) {
  return {
    readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
      if (!(functionName in reads)) {
        throw new Error(`unexpected read ${functionName}`);
      }
      return reads[functionName];
    }),
    getBalance: vi.fn(async () => reads.balance as bigint),
  };
}

const enabledConfig = [
  BigInt(10) ** BigInt(27),
  BigInt(100),
  BigInt('1680000000000000000'),
  BigInt('4200000000000000000'),
  0,
  200,
  true,
] as const;

const economics =
  '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7' as const;

describe('pons preflight', () => {
  it('passes for public creator with sufficient ETH', async () => {
    const launchFee = BigInt(500000000000000);
    const quoteIn = BigInt(10) ** BigInt(16);
    const client = mockClient({
      canLaunch: true,
      launchEnabled: true,
      launchFee,
      getLaunchConfig: enabledConfig,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 1000,
      balance: launchFee + quoteIn + BigInt(1),
    });

    const result = await runPonsPreflight({
      publicClient: client as never,
      chainId: PONS_V2_CHAIN_ID,
      input: { creator, quoteInWei: quoteIn, creatorTaxBps: 0 },
    });

    expect(result.canLaunch).toBe(true);
    expect(result.launchFeeWei).toBe(launchFee);
    expect(result.requiredMsgValueWei).toBe(launchFee + quoteIn);
    expect(result.expectedEconomics).toBe(economics);
    expect(result.configEnabled).toBe(true);
    expect(result.maxCreatorTaxBps).toBe(1000);
  });

  it('fails when canLaunch=false', async () => {
    const client = mockClient({
      canLaunch: false,
      launchEnabled: true,
      launchFee: BigInt(1),
      getLaunchConfig: enabledConfig,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 1000,
      balance: BigInt(10) ** BigInt(18),
    });
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps: 0 },
      }),
    ).rejects.toMatchObject({ code: 'LAUNCH_NOT_ALLOWED' } satisfies Partial<PonsAdapterError>);
  });

  it('fails when config 0 disabled', async () => {
    const disabled = [...enabledConfig];
    disabled[6] = false;
    const client = mockClient({
      canLaunch: true,
      launchEnabled: true,
      launchFee: BigInt(1),
      getLaunchConfig: disabled,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 1000,
      balance: BigInt(10) ** BigInt(18),
    });
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps: 0 },
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_DISABLED' });
  });

  it('fails when creator tax above cap', async () => {
    const client = mockClient({
      canLaunch: true,
      launchEnabled: true,
      launchFee: BigInt(1),
      getLaunchConfig: enabledConfig,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 1000,
      balance: BigInt(10) ** BigInt(18),
    });
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps: 1001 },
      }),
    ).rejects.toMatchObject({ code: 'CREATOR_TAX_TOO_HIGH' });
  });

  it('accepts 100 and 200 bps when the live cap allows them', async () => {
    for (const creatorTaxBps of [100, 200]) {
      const client = mockClient({
        canLaunch: true,
        launchEnabled: true,
        launchFee: BigInt(1),
        getLaunchConfig: enabledConfig,
        previewLaunchEconomics: economics,
        maxCreatorTaxBps: 1000,
        balance: BigInt(10) ** BigInt(18),
      });
      const result = await runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps },
      });
      expect(result.maxCreatorTaxBps).toBe(1000);
    }
  });

  it('blocks 200 bps without clamping when the live cap is lower', async () => {
    const client = mockClient({
      canLaunch: true,
      launchEnabled: true,
      launchFee: BigInt(1),
      getLaunchConfig: enabledConfig,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 150,
      balance: BigInt(10) ** BigInt(18),
    });
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps: 200 },
      }),
    ).rejects.toMatchObject({ code: 'CREATOR_TAX_TOO_HIGH' });
  });

  it('fails on insufficient ETH', async () => {
    const launchFee = BigInt(500000000000000);
    const quoteIn = BigInt(10) ** BigInt(16);
    const client = mockClient({
      canLaunch: true,
      launchEnabled: true,
      launchFee,
      getLaunchConfig: enabledConfig,
      previewLaunchEconomics: economics,
      maxCreatorTaxBps: 1000,
      balance: launchFee + quoteIn - BigInt(1),
    });
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: quoteIn, creatorTaxBps: 0 },
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ETH' });
  });

  it('fails on wrong chain', async () => {
    const client = mockClient({});
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: 1,
        input: { creator, quoteInWei: BigInt(1), creatorTaxBps: 0 },
      }),
    ).rejects.toMatchObject({ code: 'WRONG_CHAIN' });
  });

  it('rejects zero dev buy', async () => {
    const client = mockClient({});
    await expect(
      runPonsPreflight({
        publicClient: client as never,
        chainId: PONS_V2_CHAIN_ID,
        input: { creator, quoteInWei: BigInt(0), creatorTaxBps: 0 },
      }),
    ).rejects.toMatchObject({ code: 'ZERO_DEV_BUY' });
  });
});
