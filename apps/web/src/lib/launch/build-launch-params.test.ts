import { describe, expect, it } from 'vitest';
import { zeroAddress } from 'viem';
import { buildLaunchParams } from '@/lib/launch/build-launch-params';
import { walletCreatorId } from '@/lib/launch/creator-id';
import { createInitialLaunchState, LAUNCH_FEE_WEI } from '@/lib/launch/types';
import { generateLaunchSalt } from '@/lib/launch/salt';
import {
  LAUNCH_WRITE_ENABLED,
  prepareWalletLaunchRequest,
} from '@/lib/launch/execute';

const WALLET = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C';
const IPFS =
  'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

function readyState(overrides: Parameters<typeof createInitialLaunchState>[0] = {}) {
  return createInitialLaunchState({
    name: 'Hello World',
    ticker: 'HELLO',
    description: 'Hello, world. This is a test.',
    twitter: 'https://x.com/scoopterminal',
    quoteAsset: zeroAddress,
    quoteSymbol: 'ETH',
    creatorMode: 'custom',
    creatorCustomAddress: WALLET,
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
    sourceProviderArticleId: 'art_99',
    sourceDraftId: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  });
}

describe('buildLaunchParams', () => {
  it('maps validated state to Factory LaunchParams with correct creatorId', () => {
    const state = readyState();
    const result = buildLaunchParams({
      state,
      liveConnectedAddress: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.creatorId).toBe(walletCreatorId(WALLET));
    expect(result.params.quoteAsset.toLowerCase()).toBe(zeroAddress);
    expect(result.params.name).toBe('Hello World');
    expect(result.params.symbol).toBe('HELLO');
    expect(result.params.metadata.imageUri).toBe(IPFS);
    expect(result.params.metadata.description).toBe('Hello, world. This is a test.');
    expect(result.params.metadata.twitter).toBe('https://x.com/scoopterminal');
    expect(result.params.salt).toBe(state.salt);
    expect(result.provenance.sourceProviderArticleId).toBe('art_99');
    expect(result.provenance.sourceDraftId).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('uses live connected wallet for connected mode', () => {
    const state = readyState({
      creatorMode: 'connected',
      creatorCustomAddress: '',
    });
    const result = buildLaunchParams({
      state,
      liveConnectedAddress: WALLET,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.creatorId).toBe(walletCreatorId(WALLET));
    expect(result.creator.type).toBe('wallet');
  });

  it('rejects missing creator / invalid image / invalid salt', () => {
    expect(
      buildLaunchParams({
        state: readyState({ creatorMode: 'connected', creatorCustomAddress: '' }),
        liveConnectedAddress: null,
      }).ok,
    ).toBe(false);

    expect(
      buildLaunchParams({
        state: readyState({
          image: {
            ...readyState().image,
            ipfsUri: 'https://example.com/x.png',
            persistence: 'local_only',
          },
        }),
        liveConnectedAddress: null,
      }).ok,
    ).toBe(false);

    expect(
      buildLaunchParams({
        state: readyState({ salt: '0x1234' as `0x${string}` }),
        liveConnectedAddress: null,
      }).ok,
    ).toBe(false);
  });

  it('rejects unresolved X mode', () => {
    const result = buildLaunchParams({
      state: readyState({
        creatorMode: 'x',
        creatorX: { status: 'unresolved', handleSnapshot: '@scoop' },
      }),
      liveConnectedAddress: WALLET,
    });
    expect(result.ok).toBe(false);
  });

  it('accepts ETH zero-address quote explicitly', () => {
    const result = buildLaunchParams({
      state: readyState({ quoteAsset: zeroAddress }),
      liveConnectedAddress: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params.quoteAsset).toBe(zeroAddress);
  });
});

describe('prepareWalletLaunchRequest', () => {
  it('prepares launch with fee value; writes are enabled for V2.C', () => {
    expect(LAUNCH_WRITE_ENABLED).toBe(true);
    const built = buildLaunchParams({
      state: readyState(),
      liveConnectedAddress: null,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const req = prepareWalletLaunchRequest({
      params: built.params,
      account: WALLET,
      launchFeeWei: LAUNCH_FEE_WEI,
    });
    expect(req.functionName).toBe('launch');
    expect(req.value).toBe(LAUNCH_FEE_WEI);
  });
});

describe('salt helper', () => {
  it('generates 32-byte hex salts', () => {
    const salt = generateLaunchSalt();
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});
