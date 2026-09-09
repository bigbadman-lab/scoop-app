/**
 * Truthful launch transaction + completion states (V2.C / V2.D).
 * MARKET LIVE requires canonical indexed market readiness — not receipt alone.
 */
export type LaunchTxPhase =
  | 'idle'
  | 'preparing_artwork'
  | 'simulating'
  | 'awaiting_wallet'
  | 'submitted'
  | 'confirming'
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
  poolId: string;
  feeDistributorAddress: string;
  liquidityLockerAddress: string;
  name: string;
  symbol: string;
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
    phase === 'simulating' ||
    phase === 'awaiting_wallet' ||
    phase === 'submitted' ||
    phase === 'confirming' ||
    phase === 'waiting_for_indexer' ||
    phase === 'indexed' ||
    phase === 'activating_news'
  );
}

/** Post-receipt completion in progress or finished (blocks rebroadcast). */
export function isLaunchCompletionActive(phase: LaunchTxPhase): boolean {
  return (
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

export function isMarketLivePhase(phase: LaunchTxPhase): boolean {
  return phase === 'market_live' || phase === 'news_activation_failed';
}

export function launchTxStatusLabel(phase: LaunchTxPhase): string {
  switch (phase) {
    case 'idle':
      return '';
    case 'preparing_artwork':
      return 'Preparing artwork…';
    case 'simulating':
      return 'Simulating launch…';
    case 'awaiting_wallet':
      return 'Confirm in wallet…';
    case 'submitted':
      return 'Transaction submitted…';
    case 'confirming':
      return 'Waiting for confirmation…';
    case 'receipt_success':
      return 'Launch transaction confirmed';
    case 'receipt_success_details_pending':
      return 'Launch confirmed — details pending';
    case 'waiting_for_indexer':
      return 'Getting your market ready…';
    case 'indexed':
      return 'Market indexed';
    case 'activating_news':
      return 'Linking News article…';
    case 'market_live':
      return 'MARKET LIVE';
    case 'indexing_timeout':
      return 'Indexing delayed';
    case 'news_activation_failed':
      return 'Market live — News sync pending';
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
