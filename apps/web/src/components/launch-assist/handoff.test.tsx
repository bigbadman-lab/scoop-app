import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASSISTED_LAUNCH_HANDOFF_KEY,
  ASSISTED_LAUNCH_MARKER,
  LAUNCH_ASSIST_HANDOFF_KEY,
} from '@/lib/launch-assist/types';
import {
  clearAssistedLaunchHandoff,
  consumeAssistedLaunchHandoff,
  readAssistedLaunchHandoff,
  saveAssistedLaunchHandoff,
  saveSelectedLaunchConcept,
} from '@/lib/launch-assist/handoff';

const article = {
  providerArticleId: '77',
  headline: 'Markets react',
  sourceDomain: 'reuters.com',
  publishedAt: '2026-09-07T12:00:00.000Z',
  url: 'https://reuters.com/a',
};

const concept = {
  id: 'concept_1' as const,
  name: 'Rate Spike',
  ticker: 'RATE',
  description: 'desc',
  recommendedPairAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  recommendedPairSymbol: 'NVDA',
  pairRationale: 'why',
  imageDirection: 'desk',
  pairEnabled: true,
};

describe('launch-assist handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and consumes assisted launch prefill once', () => {
    saveAssistedLaunchHandoff({
      marker: ASSISTED_LAUNCH_MARKER,
      providerArticleId: '77',
      article,
      concept,
      draftId: 'draft-1',
      quoteAsset: concept.recommendedPairAddress,
      quoteSymbol: 'NVDA',
      image: {
        source: 'generated',
        previewUrl: 'https://signed.example/1.png',
        fileName: 'token-1.png',
        mimeType: 'image/png',
        byteSize: null,
        artworkAssetId: 'a1',
        draftId: 'draft-1',
      },
      createdAt: new Date().toISOString(),
    });

    expect(readAssistedLaunchHandoff()?.concept.name).toBe('Rate Spike');
    const consumed = consumeAssistedLaunchHandoff();
    expect(consumed?.image.previewUrl).toBe('https://signed.example/1.png');
    expect(sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY)).toBeNull();
    expect(consumeAssistedLaunchHandoff()).toBeNull();
  });

  it('accepts pending artwork handoff without previewUrl', () => {
    saveAssistedLaunchHandoff({
      marker: ASSISTED_LAUNCH_MARKER,
      providerArticleId: '77',
      article,
      concept,
      draftId: 'draft-pending',
      quoteAsset: concept.recommendedPairAddress,
      quoteSymbol: 'NVDA',
      image: {
        source: 'pending',
        previewUrl: null,
        fileName: null,
        mimeType: null,
        byteSize: null,
        draftId: 'draft-pending',
      },
      createdAt: new Date().toISOString(),
    });
    const handoff = readAssistedLaunchHandoff();
    expect(handoff?.image.source).toBe('pending');
    expect(handoff?.draftId).toBe('draft-pending');
  });

  it('rejects handoff without marker', () => {
    sessionStorage.setItem(
      ASSISTED_LAUNCH_HANDOFF_KEY,
      JSON.stringify({ concept, image: { previewUrl: 'x' } }),
    );
    expect(readAssistedLaunchHandoff()).toBeNull();
  });

  it('keeps concept handoff separate from launch prefill', () => {
    saveSelectedLaunchConcept({
      providerArticleId: '77',
      article,
      concept,
      selectedAt: new Date().toISOString(),
    });
    expect(sessionStorage.getItem(LAUNCH_ASSIST_HANDOFF_KEY)).toBeTruthy();
    clearAssistedLaunchHandoff();
    expect(sessionStorage.getItem(LAUNCH_ASSIST_HANDOFF_KEY)).toBeTruthy();
  });
});
