import { describe, expect, it, vi } from 'vitest';
import { encodeEventTopics, encodeAbiParameters, keccak256 } from 'viem';
import {
  assertCreatorIdMatches,
  assertDeployerMatches,
  decodeTokenLaunchedFromReceipt,
  tokenLaunchedEventAbi,
} from '@/lib/launch/decode-launch';
import {
  LaunchAccountChangedError,
  LaunchChainChangedError,
  LAUNCH_WRITE_ENABLED,
  prepareWalletLaunchRequest,
  writeLaunchAfterSimulation,
  SCOOP_FACTORY_ADDRESS,
} from '@/lib/launch/execute';
import { walletCreatorId } from '@/lib/launch/creator-id';
import { buildLaunchParams } from '@/lib/launch/build-launch-params';
import { createInitialLaunchState } from '@/lib/launch/types';
import { zeroAddress } from 'viem';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

const WALLET_A = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C' as const;
const WALLET_B = '0x1111111111111111111111111111111111111111' as const;
const IPFS =
  'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

function readyState() {
  return createInitialLaunchState({
    name: 'Hello World',
    ticker: 'HELLO',
    description: 'Hello, world. This is a test.',
    quoteAsset: zeroAddress,
    creatorMode: 'connected',
    image: {
      previewUrl: 'blob:x',
      fileName: 'x.png',
      mimeType: 'image/png',
      byteSize: 10,
      persistence: 'ipfs_ready',
      ipfsUri: IPFS,
      source: 'user',
      artworkStatus: 'ready',
      artworkError: null,
      artworkAssetId: null,
    },
    sourceProvider: 'stocknewsapi',
    sourceProviderArticleId: '77',
    sourceDraftId: '11111111-1111-1111-1111-111111111111',
  });
}

describe('V2.C wallet launch preparation', () => {
  it('enables writes and prepares launch only (not launchAndBuy)', () => {
    expect(LAUNCH_WRITE_ENABLED).toBe(true);
    const built = buildLaunchParams({
      state: readyState(),
      liveConnectedAddress: WALLET_A,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const req = prepareWalletLaunchRequest({
      params: built.params,
      account: WALLET_A,
      launchFeeWei: BigInt('500000000000000'),
    });
    expect(req.functionName).toBe('launch');
    expect(req.address).toBe(SCOOP_FACTORY_ADDRESS);
    expect(req.chainId).toBe(ROBINHOOD_CHAIN_ID);
    expect(req.value).toBe(BigInt('500000000000000'));
    expect(req.args[0].creatorId).toBe(walletCreatorId(WALLET_A));
  });

  it('connected switch A→B changes creatorId; custom C stays', () => {
    const connected = readyState();
    const a = buildLaunchParams({
      state: connected,
      liveConnectedAddress: WALLET_A,
    });
    const b = buildLaunchParams({
      state: connected,
      liveConnectedAddress: WALLET_B,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.params.creatorId).toBe(walletCreatorId(WALLET_A));
    expect(b.params.creatorId).toBe(walletCreatorId(WALLET_B));

    const custom = readyState();
    custom.creatorMode = 'custom';
    custom.creatorCustomAddress = WALLET_A;
    const c1 = buildLaunchParams({ state: custom, liveConnectedAddress: WALLET_B });
    const c2 = buildLaunchParams({ state: custom, liveConnectedAddress: WALLET_A });
    expect(c1.ok && c2.ok).toBe(true);
    if (!c1.ok || !c2.ok) return;
    expect(c1.params.creatorId).toBe(walletCreatorId(WALLET_A));
    expect(c2.params.creatorId).toBe(c1.params.creatorId);
  });

  it('rejects unresolved X', () => {
    const state = readyState();
    state.creatorMode = 'x';
    state.creatorX = { status: 'unresolved', handleSnapshot: '@x' };
    expect(
      buildLaunchParams({ state, liveConnectedAddress: WALLET_A }).ok,
    ).toBe(false);
  });

  it('preserves news provenance outside calldata', () => {
    const built = buildLaunchParams({
      state: readyState(),
      liveConnectedAddress: WALLET_A,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.provenance.sourceProviderArticleId).toBe('77');
    expect(
      JSON.stringify(built.params).includes('stocknewsapi'),
    ).toBe(false);
  });
});

describe('wallet safety after simulation', () => {
  it('aborts write when account changes', async () => {
    await expect(
      writeLaunchAfterSimulation({
        walletClient: { writeContract: vi.fn() } as never,
        simulatedRequest: {} as never,
        simulatedAccount: WALLET_A,
        liveAccount: WALLET_B,
        liveChainId: ROBINHOOD_CHAIN_ID,
      }),
    ).rejects.toBeInstanceOf(LaunchAccountChangedError);
  });

  it('aborts write when chain changes', async () => {
    await expect(
      writeLaunchAfterSimulation({
        walletClient: { writeContract: vi.fn() } as never,
        simulatedRequest: {} as never,
        simulatedAccount: WALLET_A,
        liveAccount: WALLET_A,
        liveChainId: 1,
      }),
    ).rejects.toBeInstanceOf(LaunchChainChangedError);
  });
});

describe('TokenLaunched decode', () => {
  it('decodes event and matches creatorId fixture', () => {
    const creatorId = walletCreatorId(WALLET_A);
    const token = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
    const topics = encodeEventTopics({
      abi: tokenLaunchedEventAbi,
      eventName: 'TokenLaunched',
      args: {
        token,
        deployer: WALLET_A,
        creatorId,
      },
    });
    const data = encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'uint160' },
        { type: 'int24' },
        { type: 'int24' },
        { type: 'int24' },
        { type: 'string' },
        { type: 'string' },
      ],
      [
        zeroAddress,
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        keccak256('0x01'),
        BigInt(1),
        BigInt(1),
        0,
        0,
        0,
        'Hello World',
        'HELLO',
      ],
    );

    const receipt = {
      status: 'success' as const,
      logs: [
        {
          address: SCOOP_FACTORY_ADDRESS,
          data,
          topics,
        },
      ],
    };

    const decoded = decodeTokenLaunchedFromReceipt(receipt);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(assertCreatorIdMatches(creatorId, decoded.decoded)).toBe(true);
    expect(assertDeployerMatches(WALLET_A, decoded.decoded)).toBe(true);
    expect(decoded.decoded.name).toBe('Hello World');
  });

  it('does not mark success from hash alone / failed decode does not fabricate', () => {
    const failed = decodeTokenLaunchedFromReceipt({
      status: 'reverted',
      logs: [],
    });
    expect(failed.ok).toBe(false);

    const missing = decodeTokenLaunchedFromReceipt({
      status: 'success',
      logs: [],
    });
    expect(missing.ok).toBe(false);
  });
});
