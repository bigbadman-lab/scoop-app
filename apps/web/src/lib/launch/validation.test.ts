import { describe, expect, it } from 'vitest';
import {
  canAdvanceFromStep,
  compatibleAssistWebsite,
  hasDevBuy,
  isArtworkBlockingLaunch,
  isArtworkInFlight,
  normalizeTicker,
  validateDevBuyStep,
  validateEarningsStep,
  validateImageFile,
  validateMarketStep,
  validateTokenStep,
} from '@/lib/launch/validation';
import { createInitialLaunchState, PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import { launchReducer } from '@/lib/launch/state';

const WALLET = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C';

function validTokenState() {
  return createInitialLaunchState({
    name: 'Meme Name',
    ticker: 'MEME',
    description: 'A short description of the market.',
    image: {
      previewUrl: 'blob:preview',
      fileName: 'meme.png',
      mimeType: 'image/png',
      byteSize: 1200,
      persistence: 'local_only',
      ipfsUri: null,
      displayImagePath: null,
      source: 'user',
      artworkStatus: 'ready',
      artworkError: null,
      artworkAssetId: null,
    },
  });
}

function pendingAiImageState() {
  return createInitialLaunchState({
    name: 'Meme Name',
    ticker: 'MEME',
    description: 'A short description of the market.',
    image: {
      previewUrl: null,
      fileName: null,
      mimeType: null,
      byteSize: null,
      persistence: 'local_only',
      ipfsUri: null,
      displayImagePath: null,
      source: 'ai_pending',
      artworkStatus: 'pending',
      artworkError: null,
      artworkAssetId: null,
    },
  });
}

describe('launch token validation', () => {
  it('requires name, ticker, description, image', () => {
    const errors = validateTokenStep(createInitialLaunchState());
    expect(errors.name).toBeTruthy();
    expect(errors.ticker).toBeTruthy();
    expect(errors.description).toBeTruthy();
    expect(errors.image).toBeTruthy();
  });

  it('allows continue while AI artwork is in flight without preview', () => {
    const errors = validateTokenStep(pendingAiImageState());
    expect(errors.image).toBeUndefined();
    expect(isArtworkInFlight(pendingAiImageState().image)).toBe(true);
    expect(isArtworkBlockingLaunch(pendingAiImageState())).toBe(true);
  });

  it('blocks final launch until artwork resolves', () => {
    expect(isArtworkBlockingLaunch(validTokenState())).toBe(false);
    expect(
      isArtworkBlockingLaunch(
        createInitialLaunchState({
          image: {
            previewUrl: 'https://x/a.png',
            fileName: 'a.png',
            mimeType: 'image/png',
            byteSize: null,
            persistence: 'local_only',
            ipfsUri: null,
      displayImagePath: null,
            source: 'ai',
            artworkStatus: 'regenerating',
            artworkError: null,
            artworkAssetId: 'a1',
          },
        }),
      ),
    ).toBe(true);
  });

  it('normalizes and validates ticker', () => {
    expect(normalizeTicker('$meme')).toBe('MEME');
    const bad = validateTokenStep(createInitialLaunchState({ ticker: '!' }));
    expect(bad.ticker).toBeTruthy();
    const ok = validateTokenStep(validTokenState());
    expect(Object.keys(ok)).toHaveLength(0);
  });

  it('validates optional social prefixes', () => {
    const errors = validateTokenStep(
      createInitialLaunchState({
        ...validTokenState(),
        twitter: 'not-a-url',
      }),
    );
    expect(errors.twitter).toMatch(/x\.com/i);
  });

  it('defaults website to empty and accepts valid https website', () => {
    expect(createInitialLaunchState().website).toBe('');
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: 'https://scoop.fun',
        }),
      ).website,
    ).toBeUndefined();
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: 'https://example.com/x',
        }),
      ).website,
    ).toBeUndefined();
  });

  it('rejects bare, http, unsafe, and overlong website values', () => {
    expect(
      validateTokenStep(
        createInitialLaunchState({ ...validTokenState(), website: 'example.com' }),
      ).website,
    ).toMatch(/https:\/\//i);
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: 'http://example.com',
        }),
      ).website,
    ).toMatch(/https:\/\//i);
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: 'javascript:alert(1)',
        }),
      ).website,
    ).toMatch(/https:\/\//i);
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: 'data:text/html,hi',
        }),
      ).website,
    ).toMatch(/https:\/\//i);
    expect(
      validateTokenStep(
        createInitialLaunchState({
          ...validTokenState(),
          website: `https://${'a'.repeat(300)}.com`,
        }),
      ).website,
    ).toMatch(/256/i);
  });

  it('compatibleAssistWebsite only accepts Website-compatible article URLs', () => {
    expect(compatibleAssistWebsite('https://scoop.fun/story')).toBe('https://scoop.fun/story');
    expect(compatibleAssistWebsite(' https://example.com/x ')).toBe('https://example.com/x');
    expect(compatibleAssistWebsite('')).toBe('');
    expect(compatibleAssistWebsite(null)).toBe('');
    expect(compatibleAssistWebsite(undefined)).toBe('');
    expect(compatibleAssistWebsite('http://example.com')).toBe('');
    expect(compatibleAssistWebsite('example.com')).toBe('');
    expect(compatibleAssistWebsite('javascript:alert(1)')).toBe('');
    expect(compatibleAssistWebsite('data:text/html,hi')).toBe('');
    expect(compatibleAssistWebsite(`https://${'a'.repeat(300)}.com`)).toBe('');
  });

  it('validates image mime/size', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' });
    expect(validateImageFile(file)).toMatch(/png/i);
  });
});

describe('launch market + earnings (Gate 7 Pons public)', () => {
  it('ETH pair is fixed — market step validates mandatory ETH buy', () => {
    const empty = validateMarketStep(createInitialLaunchState());
    expect(empty.devBuyAmount).toBeTruthy();
    expect(empty.quoteAsset).toBeUndefined();
  });

  it('requires non-zero ETH buy on Dev Buy step', () => {
    expect(
      validateDevBuyStep(createInitialLaunchState({ devBuyAmount: '' })).devBuyAmount,
    ).toBeTruthy();
    expect(
      validateDevBuyStep(createInitialLaunchState({ devBuyAmount: '0' })).devBuyAmount,
    ).toBeTruthy();
    expect(
      validateDevBuyStep(createInitialLaunchState({ devBuyAmount: '0.05' })).devBuyAmount,
    ).toBeUndefined();
  });

  it('allows connected mode when live wallet is present (earnings wrapper)', () => {
    const errors = validateEarningsStep(
      createInitialLaunchState({ creatorMode: 'connected', devBuyAmount: '0.05' }),
      WALLET,
    );
    expect(errors.creatorMode).toBeUndefined();
    expect(errors.devBuyAmount).toBeUndefined();
  });

  it('blocks connected mode without wallet', () => {
    expect(
      validateEarningsStep(
        createInitialLaunchState({ creatorMode: 'connected', devBuyAmount: '0.05' }),
        null,
      ).creatorMode,
    ).toMatch(/connect/i);
  });

  it('treats empty/zero as no dev buy; rejects invalid amount', () => {
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '' }))).toBe(false);
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '0' }))).toBe(false);
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '0.01' }))).toBe(true);
    const bad = validateDevBuyStep(
      createInitialLaunchState({
        devBuyAmount: 'abc',
      }),
    );
    expect(bad.devBuyAmount).toBeTruthy();
  });
});

describe('launch reducer navigation', () => {
  it('starts at step 1 and preserves data on back', () => {
    let state = createInitialLaunchState();
    expect(state.step).toBe(1);
    state = launchReducer(state, { type: 'PATCH', patch: { name: 'Alpha' } });
    state = launchReducer(state, { type: 'SET_STEP', step: 2 });
    expect(state.step).toBe(2);
    expect(state.name).toBe('Alpha');
    state = launchReducer(state, { type: 'SET_STEP', step: 1 });
    expect(state.name).toBe('Alpha');
  });

  it('preserves salt and news provenance across creator mode changes', () => {
    let state = createInitialLaunchState({
      sourceProvider: 'stocknewsapi',
      sourceProviderArticleId: 'a1',
      sourceDraftId: '11111111-1111-1111-1111-111111111111',
    });
    const salt = state.salt;
    state = launchReducer(state, { type: 'SET_CREATOR_MODE', mode: 'custom' });
    state = launchReducer(state, {
      type: 'PATCH',
      patch: { creatorCustomAddress: WALLET },
    });
    expect(state.salt).toBe(salt);
    expect(state.sourceProviderArticleId).toBe('a1');
    expect(state.creatorMode).toBe('custom');
  });

  it('resets dev buy when quote changes', () => {
    let state = createInitialLaunchState({
      quoteAsset: '0x0000000000000000000000000000000000000000',
      quoteSymbol: 'ETH',
      quoteDecimals: 18,
      devBuyAmount: '0.01',
    });
    state = launchReducer(state, {
      type: 'SELECT_QUOTE',
      quoteAsset: '0x1111111111111111111111111111111111111111',
      quoteSymbol: 'NVDA',
      quoteDecimals: 18,
    });
    expect(state.devBuyAmount).toBe('');
    expect(state.quoteSymbol).toBe('NVDA');
    expect(state.quoteDecimals).toBe(18);
  });

  it('accepts positive ETH dev buy', () => {
    const errors = validateDevBuyStep(
      createInitialLaunchState({
        quoteAsset: '0x0000000000000000000000000000000000000000',
        quoteSymbol: 'ETH',
        quoteDecimals: 18,
        devBuyAmount: '0.05',
      }),
    );
    expect(errors.devBuyAmount).toBeUndefined();
  });

  it('only advances when step is valid (Token / Dev Buy)', () => {
    expect(canAdvanceFromStep(1, createInitialLaunchState())).toBe(false);
    expect(canAdvanceFromStep(1, validTokenState())).toBe(true);
    expect(
      canAdvanceFromStep(2, createInitialLaunchState({ creatorMode: 'connected' }), WALLET),
    ).toBe(false);
    expect(
      canAdvanceFromStep(
        2,
        createInitialLaunchState({
          creatorMode: 'connected',
          devBuyAmount: '0.05',
        }),
        WALLET,
      ),
    ).toBe(true);
  });
});

describe('protocol fee categories', () => {
  it('keeps creator / deployer / protocol shares distinct and summing to 100%', () => {
    const sum =
      PROTOCOL_FEE_SPLIT.creatorRewardsBps +
      PROTOCOL_FEE_SPLIT.deployerBps +
      PROTOCOL_FEE_SPLIT.buybackBps +
      PROTOCOL_FEE_SPLIT.operationsBps;
    expect(sum).toBe(PROTOCOL_FEE_SPLIT.denominator);
    expect(PROTOCOL_FEE_SPLIT.creatorRewardsBps).toBe(7000);
    expect(PROTOCOL_FEE_SPLIT.deployerBps).toBe(400);
  });
});
