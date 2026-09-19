/**
 * Truthful launch transaction + completion states (V2.C / V2.D).
 * MARKET LIVE requires canonical indexed market readiness — not receipt alone.
 */
export type LaunchTxPhase =
  | 'idle'
  | 'preparing_artwork'
  | 'approving_quote'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
  /** Pons launch confirmed; HoodLock required (Gate 7). */
  | 'lock_required'
  | 'lock_preparing'
  | 'approving_lock'
  | 'awaiting_lock_wallet'
  | 'locking_dev_tokens'
  | 'verifying_lock'
  | 'lock_verified'
  | 'burning_dev_tokens'
  | 'verifying_burn'
  | 'burn_verified'
  | 'receipt_success'
  | 'receipt_success_details_pending'
  | 'waiting_for_indexer'
  | 'indexed'
  | 'activating_news'
  | 'market_live'
  | 'indexing_timeout'
  | 'news_activation_failed'
  | 'index_mismatch'
  | 'failed';

export type DecodedTokenLaunched = {
  token: `0x${string}`;
  deployer: `0x${string}`;
  creatorId: `0x${string}`;
  quoteAsset: `0x${string}`;
  feeDistributor: `0x${string}`;
  liquidityLocker: `0x${string}`;
  poolId: `0x${string}`;
  lpTokenId: string;
  name: string;
  symbol: string;
};

export type IndexedLaunchSnapshot = {
  chainId: number;
  tokenAddress: string;
  launchTxHash: string;
  creatorId: string;
  quoteAsset: string;
  deployerAddress: string;
  /** Null for Pons pre-graduation markets. */
  poolId: string | null;
  feeDistributorAddress: string | null;
  liquidityLockerAddress: string | null;
  name: string;
  symbol: string;
  marketSource?: 'scoop' | 'pons_v2';
  marketPhase?: 'curve' | 'graduated_pool' | null;
  curveAddress?: string | null;
};

export type LaunchTxState = {
  phase: LaunchTxPhase;
  error: string | null;
  txHash: `0x${string}` | null;
  /** Expected creatorId from LaunchParams (financial check). */
  expectedCreatorId: `0x${string}` | null;
  expectedDeployer: `0x${string}` | null;
  decoded: DecodedTokenLaunched | null;
  /** Set when receipt ok but event decode failed. */
  detailsPending: boolean;
  /** Snapshot of news provenance at receipt time. */
  provenance: {
    sourceProvider: string | null;
    sourceProviderArticleId: string | null;
    sourceDraftId: string | null;
  } | null;
  /** Exact pre-sign checklist for human review / debug. */
  checklist: LaunchChecklist | null;
  /** Canonical indexed row once ready. */
  indexedLaunch: IndexedLaunchSnapshot | null;
  /** News activation outcome after indexed (V2.D). */
  newsActivation: 'idle' | 'skipped' | 'ok' | 'failed' | 'pending';
  /** Display image sync after indexed (V2.F) — never fails the launch. */
  displayImageSync: 'idle' | 'skipped' | 'ok' | 'failed';
};

export type LaunchChecklist = {
  chainId: number;
  factory: `0x${string}`;
  functionName: 'launch' | 'launchAndBuy';
  signer: `0x${string}`;
  /** Initial buy recipient = msg.sender (signer). */
  buyRecipient: `0x${string}`;
  creatorType: 'wallet';
  creatorSource: 'connected' | 'custom';
  creatorWallet: `0x${string}`;
  creatorId: `0x${string}`;
  quoteAsset: `0x${string}`;
  launchFeeWei: string;
  quoteAmountInWei: string;
  expectedTokensOut: string;
  minTokensOut: string;
  slippageBps: number;
  msgValueWei: string;
  salt: `0x${string}`;
  imageUri: string;
  tokenName: string;
  tokenSymbol: string;
  additionalFee: number;
  totalPoolFee: number;
  creatorAllocationDestination: number;
  additionalFeeDestination: number;
};

export const INITIAL_LAUNCH_TX_STATE: LaunchTxState = {
  phase: 'idle',
  error: null,
  txHash: null,
  expectedCreatorId: null,
  expectedDeployer: null,
  decoded: null,
  detailsPending: false,
  provenance: null,
  checklist: null,
  indexedLaunch: null,
  newsActivation: 'idle',
  displayImageSync: 'idle',
};

export function isLaunchTxBusy(phase: LaunchTxPhase): boolean {
  return (
    phase === 'preparing_artwork' ||
    phase === 'approving_quote' ||
    phase === 'simulating' ||
    phase === 'awaiting_wallet' ||
    phase === 'submitted' ||
    phase === 'confirming' ||
    phase === 'lock_preparing' ||
    phase === 'approving_lock' ||
    phase === 'awaiting_lock_wallet' ||
    phase === 'locking_dev_tokens' ||
    phase === 'verifying_lock' ||
    phase === 'burning_dev_tokens' ||
    phase === 'verifying_burn' ||
    phase === 'waiting_for_indexer' ||
    phase === 'indexed' ||
    phase === 'activating_news'
  );
}

/** Post-broadcast / post-lock completion in progress or finished (blocks relaunch). */
export function isLaunchCompletionActive(phase: LaunchTxPhase): boolean {
  return (
    phase === 'lock_required' ||
    phase === 'lock_verified' ||
    phase === 'burn_verified' ||
    phase === 'receipt_success' ||
    phase === 'receipt_success_details_pending' ||
    phase === 'waiting_for_indexer' ||
    phase === 'indexed' ||
    phase === 'activating_news' ||
    phase === 'market_live' ||
    phase === 'indexing_timeout' ||
    phase === 'news_activation_failed' ||
    phase === 'index_mismatch'
  );
}

/** True once Pons tx hash exists or HoodLock/indexing is underway — never show fresh Launch. */
export function isPostBroadcastRelaunchBlocked(phase: LaunchTxPhase): boolean {
  return (
    phase === 'submitted' ||
    phase === 'confirming' ||
    isLaunchTxBusy(phase) ||
    isLaunchCompletionActive(phase)
  );
}

export function isMarketLivePhase(phase: LaunchTxPhase): boolean {
  return phase === 'market_live' || phase === 'news_activation_failed';
}

export function launchTxStatusLabel(
  phase: LaunchTxPhase,
  policy: 'lock_24h' | 'lock_7d' | 'lock_3m' | 'lock_6m' | 'burn' = 'lock_6m',
): string {
  const duration =
    policy === 'lock_24h'
      ? '24 hours'
      : policy === 'lock_7d'
        ? '7 days'
        : policy === 'lock_3m'
          ? '3 calendar months'
          : '6 months';
  switch (phase) {
    case 'idle':
      return '';
    case 'preparing_artwork':
      return 'Preparing artwork…';
    case 'approving_quote':
      return 'Approve quote token…';
    case 'simulating':
      return 'Simulating launch…';
    case 'awaiting_wallet':
      return 'Confirm in wallet…';
    case 'submitted':
      return 'Transaction submitted…';
    case 'confirming':
      return 'Waiting for confirmation…';
    case 'lock_required':
      return policy === 'burn'
        ? 'Token launched — burn incomplete'
        : 'Token launched — lock incomplete';
    case 'lock_preparing':
      return policy === 'lock_6m' && duration === '6 months'
        ? 'Preparing 6-month lock…'
        : `Preparing ${duration} lock…`;
    case 'approving_lock':
      return 'Approve dev-token lock…';
    case 'awaiting_lock_wallet':
      return 'Confirm lock in wallet…';
    case 'locking_dev_tokens':
      return policy === 'lock_6m'
        ? 'Locking dev tokens for 6 months…'
        : `Locking dev tokens for ${duration}…`;
    case 'verifying_lock':
      return 'Verifying lock onchain…';
    case 'lock_verified':
      return policy === 'lock_6m'
        ? 'Dev tokens locked for 6 months.'
        : `Dev tokens locked for ${duration}.`;
    case 'burning_dev_tokens':
      return 'Burning dev supply';
    case 'verifying_burn':
      return 'Verifying burn';
    case 'burn_verified':
      return 'Dev supply burned.';
    case 'receipt_success':
      return 'Launch successful';
    case 'receipt_success_details_pending':
      return 'Launch confirmed — details pending';
    case 'waiting_for_indexer':
      return 'Market data is appearing now.';
    case 'indexed':
      return 'Market data ready';
    case 'activating_news':
      return 'Linking News article…';
    case 'market_live':
      return 'Market data ready';
    case 'indexing_timeout':
      return 'Market data delayed';
    case 'news_activation_failed':
      return 'Market live — News link pending';
    case 'index_mismatch':
      return 'Indexed data mismatch';
    case 'failed':
      return 'Launch failed';
    default:
      return '';
  }
}

/** Canonical token market path — `/token/[address]`. */
export function tokenMarketPath(tokenAddress: string): string {
  return `/token/${tokenAddress.toLowerCase()}`;
}
