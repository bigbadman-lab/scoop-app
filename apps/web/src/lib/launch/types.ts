/** Launch flow types — Phase 2 four-step desk. */

export type LaunchStepId = 1 | 2 | 3 | 4;

export const LAUNCH_STEPS = [
  { id: 1 as const, key: 'TOKEN', label: 'Token' },
  { id: 2 as const, key: 'MARKET', label: 'Market' },
  { id: 3 as const, key: 'EARNINGS', label: 'Earnings & Buy' },
  { id: 4 as const, key: 'REVIEW', label: 'Review & Launch' },
] as const;

export type CreatorRecipientMode = 'connected' | 'different' | 'x_handle';

export type TokenImageState = {
  /** Object URL for local preview — revoked on replace/remove. */
  previewUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  /** Persistence deferred until IPFS / storage write path exists. */
  persistence: 'local_only';
};

export type LaunchFormState = {
  step: LaunchStepId;
  // Step 1 — Token
  name: string;
  ticker: string;
  description: string;
  twitter: string;
  telegram: string;
  image: TokenImageState;
  // Step 2 — Market
  quoteAsset: string | null;
  quoteSymbol: string | null;
  // Step 3 — Earnings & Buy
  creatorMode: CreatorRecipientMode;
  creatorAddress: string;
  /** Optional initial buy in selected quote units (human decimal string). Empty or 0 = no buy. */
  devBuyAmount: string;
};

export type FieldErrors = Partial<Record<string, string>>;

export const INITIAL_IMAGE: TokenImageState = {
  previewUrl: null,
  fileName: null,
  mimeType: null,
  byteSize: null,
  persistence: 'local_only',
};

export function createInitialLaunchState(
  prefill?: Partial<LaunchFormState>,
): LaunchFormState {
  return {
    step: 1,
    name: '',
    ticker: '',
    description: '',
    twitter: '',
    telegram: '',
    image: { ...INITIAL_IMAGE },
    quoteAsset: null,
    quoteSymbol: null,
    creatorMode: 'different',
    creatorAddress: '',
    devBuyAmount: '',
    ...prefill,
  };
}

/** Protocol-fixed trading-fee split (not user-configurable). */
export const PROTOCOL_FEE_SPLIT = {
  creatorRewardsBps: 7000,
  deployerBps: 400,
  buybackBps: 2000,
  operationsBps: 600,
  denominator: 10_000,
} as const;

/** Factory LAUNCH_FEE — 0.0005 ETH (HELLO / live ScoopFactory). */
export const LAUNCH_FEE_ETH = '0.0005' as const;
export const LAUNCH_FEE_WEI = BigInt('500000000000000');

/** On-chain metadata byte limits (ScoopFactory). */
export const META_LIMITS = {
  nameMax: 48,
  tickerMin: 2,
  tickerMax: 10,
  descriptionMax: 280,
  socialMax: 256,
  imageUriMax: 128,
  imageFileMaxBytes: 5 * 1024 * 1024,
  imageMime: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const;
