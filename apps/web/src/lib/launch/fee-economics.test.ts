import { describe, expect, it } from 'vitest';
import {
  AdditionalFeeDestination,
  CreatorAllocationDestination,
} from '@scoop/shared';
import { buildLaunchParams } from '@/lib/launch/build-launch-params';
import {
  canLaunchCanonicalProduction,
  HISTORICAL_TEST_FACTORY_ADDRESS,
  LAUNCH_WRITE_ENABLED,
  prepareWalletLaunchRequest,
  resolveCanonicalLaunchFactoryAddress,
  writeLaunchAfterSimulation,
} from '@/lib/launch/execute';
import { createInitialLaunchState } from '@/lib/launch/types';
import { zeroAddress } from 'viem';

const WALLET = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C';
const IPFS =
  'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

function readyState(overrides: Parameters<typeof createInitialLaunchState>[0] = {}) {
  return createInitialLaunchState({
    name: 'Hello World',
    ticker: 'HELLO',
    description: 'Hello, world. This is a test.',
    quoteAsset: zeroAddress,
    creatorMode: 'custom',
    creatorCustomAddress: WALLET,
    image: {
      previewUrl: 'blob:x',
      fileName: 'x.png',
      mimeType: 'image/png',
      byteSize: 10,
      persistence: 'ipfs_ready',
      ipfsUri: IPFS,
      displayImagePath: null,
      source: 'user',
      artworkStatus: 'ready',
      artworkError: null,
      artworkAssetId: null,
    },
    ...overrides,
  });
}

describe('canonical LaunchParams fee fields', () => {
  it('encodes enum ordinals from shared definitions', () => {
    expect(CreatorAllocationDestination.Creator).toBe(0);
    expect(CreatorAllocationDestination.Holders).toBe(1);
    expect(AdditionalFeeDestination.Creator).toBe(0);
    expect(AdditionalFeeDestination.Deployer).toBe(1);
    expect(AdditionalFeeDestination.Holders).toBe(2);
  });

  it('includes fee routing fields on successful build', () => {
    const result = buildLaunchParams({
      state: readyState({
        creatorAllocationDestination: CreatorAllocationDestination.Holders,
        additionalFee: 10_000,
        additionalFeeDestination: AdditionalFeeDestination.Deployer,
      }),
      liveConnectedAddress: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.additionalFee).toBe(10_000);
    expect(result.params.creatorAllocationDestination).toBe(
      CreatorAllocationDestination.Holders,
    );
    expect(result.params.additionalFeeDestination).toBe(
      AdditionalFeeDestination.Deployer,
    );
    expect(result.totalPoolFee).toBe(20_000);
  });

  it('defaults fee fields for old drafts without them', () => {
    const state = createInitialLaunchState({
      name: 'x',
    } as Partial<ReturnType<typeof createInitialLaunchState>>);
    expect(state.additionalFee).toBe(0);
    expect(state.creatorAllocationDestination).toBe(
      CreatorAllocationDestination.Creator,
    );
    expect(state.additionalFeeDestination).toBe(
      AdditionalFeeDestination.Creator,
    );
  });
});

describe('undeployed production safety', () => {
  it('canonical production undeployed → no broadcast helpers', () => {
    expect(canLaunchCanonicalProduction()).toBe(false);
    expect(() => resolveCanonicalLaunchFactoryAddress()).toThrow(/undeployed/);
  });

  it('prepareWalletLaunchRequest refuses while undeployed', () => {
    const built = buildLaunchParams({
      state: readyState(),
      liveConnectedAddress: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(() =>
      prepareWalletLaunchRequest({
        params: built.params,
        account: WALLET,
        launchFeeWei: BigInt('500000000000000'),
      }),
    ).toThrow(/undeployed/);
  });

  it('writeLaunchAfterSimulation refuses while undeployed', async () => {
    expect(LAUNCH_WRITE_ENABLED).toBe(true);
    await expect(
      writeLaunchAfterSimulation({
        walletClient: { writeContract: async () => '0xabc' } as never,
        simulatedRequest: {
          address: HISTORICAL_TEST_FACTORY_ADDRESS,
          abi: [],
          functionName: 'launch',
          args: [],
        } as never,
        simulatedAccount: WALLET,
        liveAccount: WALLET,
        liveChainId: 4663,
      }),
    ).rejects.toThrow(/undeployed|Historical/);
  });

  it('never silently drops fee selections from built params', () => {
    const built = buildLaunchParams({
      state: readyState({
        additionalFee: 2_000,
        additionalFeeDestination: AdditionalFeeDestination.Holders,
        creatorAllocationDestination: CreatorAllocationDestination.Creator,
      }),
      liveConnectedAddress: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.params.additionalFee).toBe(2_000);
    expect(built.params.additionalFeeDestination).toBe(
      AdditionalFeeDestination.Holders,
    );
  });
});
