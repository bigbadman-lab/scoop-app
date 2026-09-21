import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completePublicPumpLaunch } from '@/lib/launch/complete-public-pump-launch';
import { createInitialLaunchState } from '@/lib/launch/types';
import type { LaunchResult } from '@/lib/launch/launch-result';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const CREATOR = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const SIG = '5'.repeat(88);

function pumpResult(): LaunchResult {
  return {
    chain: 'solana',
    provider: 'pump',
    assetAddress: MINT,
    txHash: SIG,
    meta: { uri: 'ipfs://meta' },
  };
}

describe('completePublicPumpLaunch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards draftId for news-assisted Pump so lore can link', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tokenPath: `/token/${MINT}`,
        mint: MINT,
        signature: SIG,
        created: true,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const state = createInitialLaunchState({
      name: 'Rate Spike',
      ticker: 'RATE',
      description: 'A market on rate moves',
      sourceDraftId: 'draft-news-1',
      sourceProviderArticleId: '77',
      launchRail: { chain: 'solana', provider: 'pump' },
      image: {
        ...createInitialLaunchState().image,
        ipfsUri: 'ipfs://img',
      },
    });

    const out = await completePublicPumpLaunch({
      result: pumpResult(),
      state,
      creatorWallet: CREATOR,
    });
    expect(out.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.draftId).toBe('draft-news-1');
    expect(body.mint).toBe(MINT);
  });

  it('omits draftId for non-news manual Pump launches', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        tokenPath: `/token/${MINT}`,
        mint: MINT,
        signature: SIG,
        created: true,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const state = createInitialLaunchState({
      name: 'Manual',
      ticker: 'MAN',
      description: 'no news',
      launchRail: { chain: 'solana', provider: 'pump' },
      image: {
        ...createInitialLaunchState().image,
        ipfsUri: 'ipfs://img',
      },
    });

    await completePublicPumpLaunch({
      result: pumpResult(),
      state,
      creatorWallet: CREATOR,
    });
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.draftId).toBeUndefined();
  });
});
