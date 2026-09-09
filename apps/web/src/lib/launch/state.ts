import {
  createInitialLaunchState,
  INITIAL_IMAGE,
  type CreatorRecipientMode,
  type LaunchFormState,
  type LaunchStepId,
  type TokenImageState,
} from '@/lib/launch/types';
import { normalizeTicker } from '@/lib/launch/validation';

export type LaunchAction =
  | { type: 'SET_STEP'; step: LaunchStepId }
  | { type: 'PATCH'; patch: Partial<LaunchFormState> }
  | { type: 'SET_TICKER'; ticker: string }
  | { type: 'SET_IMAGE'; image: TokenImageState }
  | { type: 'CLEAR_IMAGE' }
  | { type: 'SELECT_QUOTE'; quoteAsset: string; quoteSymbol: string }
  | { type: 'SET_CREATOR_MODE'; mode: CreatorRecipientMode }
  | { type: 'RESET' };

export function launchReducer(state: LaunchFormState, action: LaunchAction): LaunchFormState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'PATCH': {
      // Salt is session-stable — ignore PATCH salt so assist/prefill cannot rotate it.
      const { image, salt: _ignoreSalt, ...safe } = action.patch;
      void _ignoreSalt;
      let next: LaunchFormState = { ...state, ...safe };
      if (image) {
        if (state.image.previewUrl && state.image.previewUrl !== image.previewUrl) {
          URL.revokeObjectURL(state.image.previewUrl);
        }
        next = { ...next, image: { ...INITIAL_IMAGE, ...image } };
      }
      return next;
    }
    case 'SET_TICKER':
      return { ...state, ticker: normalizeTicker(action.ticker) };
    case 'SET_IMAGE': {
      if (state.image.previewUrl && state.image.previewUrl !== action.image.previewUrl) {
        URL.revokeObjectURL(state.image.previewUrl);
      }
      return { ...state, image: action.image };
    }
    case 'CLEAR_IMAGE': {
      if (state.image.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
      return { ...state, image: { ...INITIAL_IMAGE } };
    }
    case 'SELECT_QUOTE': {
      const quoteChanged =
        state.quoteAsset !== action.quoteAsset.toLowerCase();
      return {
        ...state,
        quoteAsset: action.quoteAsset.toLowerCase(),
        quoteSymbol: action.quoteSymbol,
        // Quote change revalidates quote-dependent state
        devBuyAmount: quoteChanged ? '' : state.devBuyAmount,
      };
    }
    case 'SET_CREATOR_MODE':
      return {
        ...state,
        creatorMode: action.mode,
        // Clear custom address when leaving custom mode; preserve news provenance.
        creatorCustomAddress:
          action.mode === 'custom' ? state.creatorCustomAddress : '',
        // X remains unresolved until server resolution (never fabricate from handle).
        creatorX:
          action.mode === 'x' ? state.creatorX : { status: 'unresolved' },
      };
    case 'RESET':
      if (state.image.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
      return createInitialLaunchState();
    default:
      return state;
  }
}
