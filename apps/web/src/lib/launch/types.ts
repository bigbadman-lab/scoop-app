/** Launch flow types — Phase 2 four-step desk + V2.B creator identity. */

import type { Hex } from 'viem';
import { generateLaunchSalt } from '@/lib/launch/salt';

export type LaunchStepId = 1 | 2 | 3 | 4;

export const LAUNCH_STEPS = [
  { id: 1 as const, key: 'TOKEN', label: 'Token' },
  { id: 2 as const, key: 'MARKET', label: 'Market' },
  { id: 3 as const, key: 'EARNINGS', label: 'Earnings & Buy' },
  { id: 4 as const, key: 'REVIEW', label: 'Review & Launch' },
] as const;

/**
 * Creator reward recipient mode (UI).
 * - connected: live wagmi account → walletCreatorId (re-resolved every time)
 * - custom: typed EVM address → walletCreatorId
 * - x: requires future server-resolved numeric X user ID (disabled in V2.B UI)
 */
export type CreatorRecipientMode = 'connected' | 'custom' | 'x';

/**
 * Future X identity slot. Financially inert until status === 'resolved'
 * with a trusted numeric xUserId (never from a typed @handle alone).
 */
export type ResolvedXCreator =
  | { status: 'unresolved'; handleSnapshot?: string }
  | {
      status: 'resolved';
      /** Immutable numeric X user ID (decimal string). Canonical. */
      xUserId: string;
      handleSnapshot?: string;
      displayNameSnapshot?: string;
      avatarUrlSnapshot?: string;
    };

/** Ownership — late AI must not overwrite `user`. */
export type TokenImageSource = 'none' | 'ai_pending' | 'ai' | 'user';

export type TokenImagePersistence = 'local_only' | 'ipfs_ready';

export type TokenImageState = {
  /** Object URL for local preview — revoked on replace/remove. */
  previewUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  /**
   * local_only until pinned. Factory requires ipfs:// — see lib/launch/ipfs.ts.
   */
  persistence: TokenImagePersistence;
  /** Protocol imageUri once pinned (ipfs://…). Null until V2.C pin path. */
  ipfsUri: string | null;
  /**
   * Server-derived token-image object path after manual display upload.
   * Never a client-fabricated arbitrary URL — finalize derives HTTPS server-side.
   */
  displayImagePath: string | null;
  source: TokenImageSource;
  artworkStatus: 'idle' | 'pending' | 'generating' | 'regenerating' | 'ready' | 'failed';
  artworkError: string | null;
  artworkAssetId: string | null;
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
  // Step 2 — Market — canonical quote token address (ETH = zero address)
  quoteAsset: string | null;
  quoteSymbol: string | null;
  // Step 3 — Earnings & Buy
  creatorMode: CreatorRecipientMode;
  /** Typed custom recipient — only used when creatorMode === 'custom'. */
  creatorCustomAddress: string;
  /**
   * Future X slot. Must not be populated from a client-typed handle for economics.
   * Remains unresolved in V2.B.
   */
  creatorX: ResolvedXCreator;
  /**
   * CREATE2 user salt (bytes32). Generated once per wizard session; preserved
   * across steps. Regenerating requires explicit action (not done automatically).
   */
  salt: Hex;
  /** Optional initial buy in selected quote units (human decimal string). Empty or 0 = no buy. */
  devBuyAmount: string;
  /**
   * Explicit news provenance (News Page V2). Survives to launch success linking.
   * Never inferred from headline/ticker — only set from assist handoff.
   * Not part of Factory calldata.
   */
  sourceProvider: string | null;
  sourceProviderArticleId: string | null;
  sourceDraftId: string | null;
};

export type FieldErrors = Partial<Record<string, string>>;

export const INITIAL_IMAGE: TokenImageState = {
  previewUrl: null,
  fileName: null,
  mimeType: null,
  byteSize: null,
  persistence: 'local_only',
  ipfsUri: null,
  displayImagePath: null,
  source: 'none',
  artworkStatus: 'idle',
  artworkError: null,
  artworkAssetId: null,
};

export function createInitialLaunchState(
  prefill?: Partial<LaunchFormState>,
): LaunchFormState {
  const base: LaunchFormState = {
    step: 1,
    name: '',
    ticker: '',
    description: '',
    twitter: '',
    telegram: '',
    image: { ...INITIAL_IMAGE },
    quoteAsset: null,
    quoteSymbol: null,
    creatorMode: 'connected',
    creatorCustomAddress: '',
    creatorX: { status: 'unresolved' },
    salt: generateLaunchSalt(),
    devBuyAmount: '',
    sourceProvider: null,
    sourceProviderArticleId: null,
    sourceDraftId: null,
  };
  if (!prefill) return base;
  const { image: imagePrefill, ...rest } = prefill;
  return {
    ...base,
    ...rest,
    image: imagePrefill ? { ...INITIAL_IMAGE, ...imagePrefill } : base.image,
    salt: rest.salt ?? base.salt,
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

/**
 * Factory LAUNCH_FEE — public immutable constant on ScoopFactory (0.0005 ether).
 * V2.C may also read via publicClient.readContract({ functionName: 'LAUNCH_FEE' }).
 * App constant matches deployed bytecode; do not diverge.
 */
export const LAUNCH_FEE_ETH = '0.0005' as const;
export const LAUNCH_FEE_WEI = BigInt('500000000000000');

/** On-chain metadata byte limits (ScoopFactory) + app file limits. */
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
