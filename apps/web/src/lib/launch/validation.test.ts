import { describe, expect, it } from 'vitest';
import {
  canAdvanceFromStep,
  hasDevBuy,
  isArtworkBlockingLaunch,
  isArtworkInFlight,
  isValidEvmAddress,
  normalizeTicker,
  validateEarningsStep,
  validateImageFile,
  validateMarketStep,
  validateTokenStep,
} from '@/lib/launch/validation';
import { createInitialLaunchState, PROTOCOL_FEE_SPLIT } from '@/lib/launch/types';
import { launchReducer } from '@/lib/launch/state';

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

  it('validates image mime/size', () => {
    const file = new File(['x'], 'a.gif', { type: 'image/gif' });
    expect(validateImageFile(file)).toMatch(/png/i);
  });
});

describe('launch market + earnings', () => {
  it('requires quote selection', () => {
    expect(validateMarketStep(createInitialLaunchState()).quoteAsset).toBeTruthy();
  });

  it('blocks unsupported creator modes', () => {
    expect(
      validateEarningsStep(createInitialLaunchState({ creatorMode: 'connected' }))
        .creatorMode,
    ).toMatch(/deferred/i);
    expect(
      validateEarningsStep(createInitialLaunchState({ creatorMode: 'x_handle' }))
        .creatorMode,
    ).toMatch(/deferred/i);
  });

  it('validates different-wallet address', () => {
    expect(isValidEvmAddress('0x35afc8a0c2f5e6a1b2c3d4e5f60718293a4b5c6d')).toBe(true);
    const missing = validateEarningsStep(
      createInitialLaunchState({ creatorMode: 'different', creatorAddress: '' }),
    );
    expect(missing.creatorAddress).toBeTruthy();
    const bad = validateEarningsStep(
      createInitialLaunchState({ creatorMode: 'different', creatorAddress: '0x123' }),
    );
    expect(bad.creatorAddress).toBeTruthy();
  });

  it('treats empty/zero as no dev buy; quote controls denomination label elsewhere', () => {
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '' }))).toBe(false);
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '0' }))).toBe(false);
    expect(hasDevBuy(createInitialLaunchState({ devBuyAmount: '0.01' }))).toBe(true);
    const bad = validateEarningsStep(
      createInitialLaunchState({
        creatorMode: 'different',
        creatorAddress: '0x35afc8a0c2f5e6a1b2c3d4e5f60718293a4b5c6d',
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

  it('resets dev buy when quote changes', () => {
    let state = createInitialLaunchState({
      quoteAsset: '0x0000000000000000000000000000000000000000',
      quoteSymbol: 'ETH',
      devBuyAmount: '0.01',
    });
    state = launchReducer(state, {
      type: 'SELECT_QUOTE',
      quoteAsset: '0x1111111111111111111111111111111111111111',
      quoteSymbol: 'NVDA',
    });
    expect(state.devBuyAmount).toBe('');
    expect(state.quoteSymbol).toBe('NVDA');
  });

  it('only advances when step is valid', () => {
    expect(canAdvanceFromStep(1, createInitialLaunchState())).toBe(false);
    expect(canAdvanceFromStep(1, validTokenState())).toBe(true);
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
