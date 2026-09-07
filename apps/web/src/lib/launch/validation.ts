import { META_LIMITS, type FieldErrors, type LaunchFormState } from '@/lib/launch/types';

const TICKER_RE = /^[A-Z0-9]{2,10}$/;
const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/^\$/, '');
}

export function isValidEvmAddress(value: string): boolean {
  return EVM_ADDRESS_RE.test(value.trim());
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

  if (!state.image.previewUrl) {
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

export function validateEarningsStep(state: LaunchFormState): FieldErrors {
  const errors: FieldErrors = {};

  if (state.creatorMode === 'connected') {
    errors.creatorMode =
      'Connected wallet is not available yet — wallet write infrastructure is deferred.';
  } else if (state.creatorMode === 'x_handle') {
    errors.creatorMode =
      'X handle creator identity is not available yet — claim/resolution is deferred.';
  } else if (state.creatorMode === 'different') {
    if (!state.creatorAddress.trim()) {
      errors.creatorAddress = 'Enter a recipient wallet address.';
    } else if (!isValidEvmAddress(state.creatorAddress)) {
      errors.creatorAddress = 'Enter a valid 0x address.';
    }
  }

  const buy = state.devBuyAmount.trim();
  if (buy !== '') {
    if (!/^\d+(\.\d+)?$/.test(buy)) {
      errors.devBuyAmount = 'Enter a valid amount.';
    } else if (Number(buy) < 0) {
      errors.devBuyAmount = 'Amount cannot be negative.';
    }
  }

  return errors;
}

export function canAdvanceFromStep(step: 1 | 2 | 3, state: LaunchFormState): boolean {
  if (step === 1) return Object.keys(validateTokenStep(state)).length === 0;
  if (step === 2) return Object.keys(validateMarketStep(state)).length === 0;
  return Object.keys(validateEarningsStep(state)).length === 0;
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
