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
    case 'PATCH':
      return { ...state, ...action.patch };
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
        creatorAddress: action.mode === 'different' ? state.creatorAddress : '',
      };
    case 'RESET':
      if (state.image.previewUrl) URL.revokeObjectURL(state.image.previewUrl);
      return createInitialLaunchState();
    default:
      return state;
  }
}
