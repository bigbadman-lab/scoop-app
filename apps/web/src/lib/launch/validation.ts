import { META_LIMITS, type FieldErrors, type LaunchFormState, type TokenImageState } from '@/lib/launch/types';
import {
  isCreatorResolved,
  resolveCreatorRecipient,
} from '@/lib/launch/creator-recipient';
import { isNativeEthQuote, parseEthDevBuyWei } from '@/lib/launch/dev-buy';
import {
  AdditionalFeeDestination,
  CreatorAllocationDestination,
  validateAdditionalFeeUnits,
} from '@scoop/shared';
const TICKER_RE = /^[A-Z0-9]{2,10}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/^\$/, '');
}

export function isValidEvmAddress(value: string): boolean {
  return EVM_ADDRESS_RE.test(value.trim());
}

/** AI artwork still running — wizard steps must stay navigable. */
export function isArtworkInFlight(image: TokenImageState): boolean {
  if (image.source === 'user') return false;
  return (
    image.artworkStatus === 'pending' ||
    image.artworkStatus === 'generating' ||
    image.artworkStatus === 'regenerating'
  );
}

/**
 * Final Launch requires a resolved token image (existing product rule).
 * Pending/regenerating blocks launch; steps 1–3 do not.
 * Protocol also requires ipfs:// — enforced by buildLaunchParams, not step nav.
 */
export function isArtworkBlockingLaunch(state: LaunchFormState): boolean {
  const { image } = state;
  if (image.source === 'user' && image.previewUrl) return false;
  if (isArtworkInFlight(image)) return true;
  if (image.artworkStatus === 'failed') return true;
  if (!image.previewUrl) return true;
  return false;
}

export function validateTokenStep(state: LaunchFormState): FieldErrors {
  const errors: FieldErrors = {};
  const name = state.name.trim();
  if (!name) errors.name = 'Name is required.';
  else if (name.length > META_LIMITS.nameMax) {
    errors.name = `Name must be ${META_LIMITS.nameMax} characters or fewer.`;
  }

  const ticker = normalizeTicker(state.ticker);
  if (!ticker) errors.ticker = 'Ticker is required.';
  else if (!TICKER_RE.test(ticker)) {
    errors.ticker = 'Ticker must be 2–10 characters (A–Z, 0–9).';
  }

  const description = state.description.trim();
  if (!description) errors.description = 'Description is required.';
  else if (description.length > META_LIMITS.descriptionMax) {
    errors.description = `Description must be ${META_LIMITS.descriptionMax} characters or fewer.`;
  }

  if (state.twitter.trim()) {
    const tw = state.twitter.trim();
    if (tw.length > META_LIMITS.socialMax) {
      errors.twitter = `X link must be ${META_LIMITS.socialMax} characters or fewer.`;
    } else if (!/^https:\/\/(x\.com|twitter\.com)\//i.test(tw)) {
      errors.twitter = 'X link must start with https://x.com/ or https://twitter.com/.';
    }
  }

  if (state.telegram.trim()) {
    const tg = state.telegram.trim();
    if (tg.length > META_LIMITS.socialMax) {
      errors.telegram = `Telegram link must be ${META_LIMITS.socialMax} characters or fewer.`;
    } else if (!/^https:\/\/t\.me\//i.test(tg)) {
      errors.telegram = 'Telegram link must start with https://t.me/.';
    }
  }

  // Allow Continue while AI artwork generates; image still required at final Launch.
  if (!state.image.previewUrl && !isArtworkInFlight(state.image)) {
    errors.image = 'Token image is required.';
  }

  return errors;
}

export function validateMarketStep(state: LaunchFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.quoteAsset) {
    errors.quoteAsset = 'Select a quote asset.';
  }
  return errors;
}

/**
 * Earnings step validation.
 * @param liveConnectedAddress — wagmi account; required when mode is connected.
 */
export function validateEarningsStep(
  state: LaunchFormState,
  liveConnectedAddress?: string | null,
): FieldErrors {
  const errors: FieldErrors = {};

  if (state.creatorMode === 'x') {
    errors.creatorMode =
      'X creator rewards are coming next. Profiles will be resolved by immutable X user ID.';
  } else {
    const recipient = resolveCreatorRecipient(state, liveConnectedAddress ?? null);
    if (!isCreatorResolved(recipient)) {
      if (state.creatorMode === 'connected') {
        errors.creatorMode = recipient.reason;
      } else {
        errors.creatorCustomAddress = recipient.reason;
      }
    }
  }

  const buy = state.devBuyAmount.trim();
  if (buy !== '') {
    if (!/^\d+(\.\d+)?$/.test(buy)) {
      errors.devBuyAmount = 'Enter a valid amount.';
    } else if (Number(buy) < 0) {
      errors.devBuyAmount = 'Amount cannot be negative.';
    } else if (hasDevBuy(state) && !isNativeEthQuote(state.quoteAsset)) {
      errors.devBuyAmount =
        'Initial buy is currently available for ETH pairs only.';
    } else if (hasDevBuy(state) && isNativeEthQuote(state.quoteAsset)) {
      const parsed = parseEthDevBuyWei(buy);
      if (!parsed.ok) {
        errors.devBuyAmount = parsed.error;
      }
    }
  }

  const feeCheck = validateAdditionalFeeUnits(state.additionalFee);
  if (!feeCheck.ok) {
    errors.additionalFee = feeCheck.message;
  }

  if (
    state.creatorAllocationDestination !== CreatorAllocationDestination.Creator &&
    state.creatorAllocationDestination !== CreatorAllocationDestination.Holders
  ) {
    errors.creatorAllocationDestination =
      'Choose whether the base creator allocation goes to the Creator or Holders.';
  }

  if (state.additionalFee > 0) {
    if (
      state.additionalFeeDestination !== AdditionalFeeDestination.Creator &&
      state.additionalFeeDestination !== AdditionalFeeDestination.Deployer &&
      state.additionalFeeDestination !== AdditionalFeeDestination.Holders
    ) {
      errors.additionalFeeDestination =
        'Choose where the additional fee should go.';
    }
  }

  return errors;
}

export function canAdvanceFromStep(
  step: 1 | 2 | 3,
  state: LaunchFormState,
  liveConnectedAddress?: string | null,
): boolean {
  if (step === 1) return Object.keys(validateTokenStep(state)).length === 0;
  if (step === 2) return Object.keys(validateMarketStep(state)).length === 0;
  return Object.keys(validateEarningsStep(state, liveConnectedAddress)).length === 0;
}

/** Human decimal → whether this is a positive dev buy. */
export function hasDevBuy(state: LaunchFormState): boolean {
  const buy = state.devBuyAmount.trim();
  if (!buy) return false;
  const n = Number(buy);
  return Number.isFinite(n) && n > 0;
}

export function validateImageFile(file: File): string | null {
  if (!(META_LIMITS.imageMime as readonly string[]).includes(file.type)) {
    return 'Use PNG, JPEG, or WebP.';
  }
  if (file.size > META_LIMITS.imageFileMaxBytes) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
}
