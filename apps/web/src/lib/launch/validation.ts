import { META_LIMITS, type FieldErrors, type LaunchFormState, type TokenImageState } from '@/lib/launch/types';
import { parseDevBuyAmount } from '@/lib/launch/dev-buy';
import { isPublicCreatorFeeBps } from '@/lib/launch/creator-fee';
import {
  readImageFileDimensions,
  squareDimensionError,
  TOKEN_IMAGE_DIMENSIONS_UNREADABLE_ERROR,
  TOKEN_IMAGE_SQUARE_ERROR,
} from '@/lib/launch/image-dimensions';

export { TOKEN_IMAGE_SQUARE_ERROR, TOKEN_IMAGE_DIMENSIONS_UNREADABLE_ERROR };
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

/**
 * Launch Assist → Website prefill filter.
 * Returns the trimmed URL only when it already satisfies Website form rules;
 * otherwise '' (do not weaken validation / do not auto-prepend https).
 */
export function compatibleAssistWebsite(raw: string | null | undefined): string {
  const site = (raw ?? '').trim();
  if (!site) return '';
  if (site.length > META_LIMITS.socialMax) return '';
  if (!/^https:\/\//i.test(site)) return '';
  return site;
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

  if (state.website.trim()) {
    const site = state.website.trim();
    if (site.length > META_LIMITS.socialMax) {
      errors.website = `Website link must be ${META_LIMITS.socialMax} characters or fewer.`;
    } else if (!/^https:\/\//i.test(site)) {
      // Align with protocol optionalHttps('website') — require https://; reject bare
      // domains, http://, and unsafe schemes (javascript:/data:/…).
      errors.website = 'Website link must start with https://';
    }
  }

  // Allow Continue while AI artwork generates; image still required at final Launch.
  if (!state.image.previewUrl && !isArtworkInFlight(state.image)) {
    errors.image = 'Token image is required.';
  }

  return errors;
}

export function validateMarketStep(state: LaunchFormState): FieldErrors {
  // Public Pons cutover: ETH pair is fixed — no quote catalogue step.
  return validateDevBuyStep(state);
}

/**
 * Dev Buy step (Gate 7 public Pons) — ETH only, non-zero mandatory.
 */
export function validateDevBuyStep(state: LaunchFormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!isPublicCreatorFeeBps(state.creatorFeeBps)) {
    errors.creatorFeeBps = 'Choose a creator fee of 1% or 2%.';
  }
  const buy = state.devBuyAmount.trim();
  if (!buy) {
    errors.devBuyAmount = 'Enter a non-zero ETH amount for the mandatory dev buy.';
    return errors;
  }
  if (!/^\d+(\.\d+)?$/.test(buy)) {
    errors.devBuyAmount = 'Enter a valid ETH amount.';
    return errors;
  }
  if (!hasDevBuy(state)) {
    errors.devBuyAmount = 'Dev buy must be greater than zero.';
    return errors;
  }
  const parsed = parseDevBuyAmount({
    raw: buy,
    decimals: 18,
    quoteSymbol: 'ETH',
    quoteAsset: '0x0000000000000000000000000000000000000000',
  });
  if (!parsed.ok) {
    errors.devBuyAmount = parsed.error;
  }
  return errors;
}

/**
 * Earnings step validation (legacy Scoop). Public Pons wizard uses validateDevBuyStep.
 * @param liveConnectedAddress — wagmi account; required when mode is connected.
 */
export function validateEarningsStep(
  state: LaunchFormState,
  liveConnectedAddress?: string | null,
): FieldErrors {
  // Public path: require connected wallet + non-zero ETH buy; ignore Scoop fee fields.
  const errors = validateDevBuyStep(state);
  if (!liveConnectedAddress) {
    errors.creatorMode = 'Connect a wallet to launch.';
  }
  return errors;
}

export function canAdvanceFromStep(
  step: 1 | 2,
  state: LaunchFormState,
  liveConnectedAddress?: string | null,
): boolean {
  if (step === 1) return Object.keys(validateTokenStep(state)).length === 0;
  return Object.keys(validateDevBuyStep(state)).length === 0 && Boolean(liveConnectedAddress);
}

/** Human decimal → whether this is a positive dev buy. */
export function hasDevBuy(state: LaunchFormState): boolean {
  const buy = state.devBuyAmount.trim();
  if (!buy) return false;
  const n = Number(buy);
  return Number.isFinite(n) && n > 0;
}

/** Sync MIME + size checks only (no decode). Prefer {@link validateImageFileAsync}. */
export function validateImageFile(file: File): string | null {
  if (!(META_LIMITS.imageMime as readonly string[]).includes(file.type)) {
    return 'Use PNG, JPEG, or WebP.';
  }
  if (file.size > META_LIMITS.imageFileMaxBytes) {
    return 'Image must be 5MB or smaller.';
  }
  return null;
}

/**
 * Full client upload gate: MIME + 5 MiB + decoded 1:1 dimensions.
 * Does not crop or transform; rejects non-square sources.
 */
export async function validateImageFileAsync(file: File): Promise<string | null> {
  const basic = validateImageFile(file);
  if (basic) return basic;
  try {
    const { width, height } = await readImageFileDimensions(file);
    return squareDimensionError(width, height);
  } catch {
    return TOKEN_IMAGE_DIMENSIONS_UNREADABLE_ERROR;
  }
}
