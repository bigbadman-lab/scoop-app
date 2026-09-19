/**
 * Gate 7 — public /launch Pons LaunchAndBuy + HoodLock + indexed readiness.
 * Replaces Scoop runWalletLaunch for the creator wizard.
 */
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from 'viem';
import { getAddress, pad } from 'viem';
import { creatorIdFromWallet } from '@scoop/shared';
import { ensureArtworkPinned } from '@/lib/launch/ensure-ipfs';
import { parseEthDevBuyWei } from '@/lib/launch/dev-buy';
import { isArtworkBlockingLaunch } from '@/lib/launch/validation';
import type { LaunchFormState, TokenImageState } from '@/lib/launch/types';
import {
  INITIAL_LAUNCH_TX_STATE,
  type DecodedTokenLaunched,
  type LaunchTxState,
} from '@/lib/launch/tx-state';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import {
  PONS_DEV_BUY_SLIPPAGE_BPS,
  PONS_NATIVE_PAIR_TOKEN,
  isLaunchCommitted,
  isLockCommitted,
  loadPonsPendingLaunch,
  type PonsPendingLaunchState,
} from '@/lib/launch/adapters/pons';
import { PonsAdapterError } from '@/lib/launch/adapters/pons/errors';
import { recoverPonsLaunchFromPending } from '@/lib/launch/adapters/pons/recover';
import { recoverHoodlockFromPending } from '@/lib/launch/adapters/pons/hoodlock-recover';
import {
  createOrResumePonsDraft,
  preparePonsLaunchAndBuy,
  broadcastPonsLaunchAndBuy,
} from '@/lib/launch/pons-orchestrate';
import {
  prepareHoodlockLock,
  broadcastHoodlockApproval,
  broadcastHoodlockLock,
} from '@/lib/launch/hoodlock-orchestrate';

export const PONS_SCHEMA_BLOCKED_MESSAGE =
  'BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY';

export type PublicPonsLaunchCallbacks = {
  onPhase: (patch: Partial<LaunchTxState>) => void;
  onImagePinned: (image: TokenImageState) => void;
  onPendingState?: (state: PonsPendingLaunchState) => void;
};

export type RunPublicPonsLaunchInput = {
  state: LaunchFormState;
  draftId: string;
  liveAddress: `0x${string}`;
  liveChainId: number | undefined;
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  getLiveAccount: () => {
    address: `0x${string}` | undefined;
    chainId: number | undefined;
  };
  /** Fail-closed Gate 6 schema readiness (server-checked). */
  schemaReady: boolean;
  callbacks: PublicPonsLaunchCallbacks;
};

export type RunPublicPonsLaunchResult =
  | {
      ok: true;
      draftId: string;
      state: LaunchTxState;
      pending: PonsPendingLaunchState;
    }
  | { ok: false; state: LaunchTxState; pending: PonsPendingLaunchState | null };

function fail(
  callbacks: PublicPonsLaunchCallbacks,
  error: string,
  base: Partial<LaunchTxState> = {},
  pending: PonsPendingLaunchState | null = null,
): RunPublicPonsLaunchResult {
  const state: LaunchTxState = {
    ...INITIAL_LAUNCH_TX_STATE,
    ...base,
    phase: base.phase ?? 'failed',
    error,
  };
  callbacks.onPhase(state);
  return { ok: false, state, pending };
}

function userFacingError(e: unknown): string {
  if (e instanceof PonsAdapterError) {
    if (e.code === 'LAUNCH_ALREADY_SUBMITTED' || e.code === 'RELAUNCH_BLOCKED') {
      return 'Your token launch has already been submitted. Do not launch again.';
    }
    if (e.code === 'PERSISTENCE_FAILED') {
      return e.message;
    }
    if (e.code === 'TX_PENDING') {
      return 'Launch transaction already submitted. Checking its status…';
    }
    if (e.code === 'LOCK_DUPLICATE_BLOCKED' || e.code === 'LOCK_ALREADY_EXISTS') {
      return 'Dev-token lock already exists. Verifying onchain…';
    }
    return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return 'Launch failed. Do not relaunch if a transaction was already submitted.';
}

function zeroBytes32(): `0x${string}` {
  return pad('0x0', { size: 32 });
}

function zeroAddress(): `0x${string}` {
  return '0x0000000000000000000000000000000000000000';
}

/**
 * Map Gate 4/5 pending → LaunchTxState decode snapshot for indexer completion.
 * UV4 pool fields intentionally empty — Pons readiness does not require them.
 */
export function ponsPendingToDecoded(
  pending: PonsPendingLaunchState,
): DecodedTokenLaunched | null {
  if (!pending.tokenAddress) return null;
  const deployer = getAddress(pending.creator) as `0x${string}`;
  return {
    token: getAddress(pending.tokenAddress) as `0x${string}`,
    deployer,
    creatorId: creatorIdFromWallet(deployer),
    quoteAsset: PONS_NATIVE_PAIR_TOKEN,
    feeDistributor: zeroAddress(),
    liquidityLocker: zeroAddress(),
    poolId: zeroBytes32(),
    lpTokenId: '0',
    name: pending.name,
    symbol: pending.symbol,
  };
}

export function ponsPhaseToTxPhase(
  phase: PonsPendingLaunchState['phase'],
): LaunchTxState['phase'] {
  switch (phase) {
    case 'draft':
    case 'review':
      return 'idle';
    case 'preflight':
    case 'simulating':
      return 'simulating';
    case 'ready_to_sign':
      return 'awaiting_wallet';
    case 'launch_submitted':
      return 'submitted';
    case 'launch_confirming':
      return 'confirming';
    case 'launch_confirmed':
    case 'token_resolved':
    case 'dev_allocation_resolved':
    case 'lock_required':
      return 'lock_required';
    case 'lock_preflight':
      return 'lock_preparing';
    case 'approval_required':
    case 'approval_submitted':
    case 'approval_confirming':
    case 'approval_confirmed':
      return 'approving_lock';
    case 'lock_ready':
      return 'awaiting_lock_wallet';
    case 'lock_submitted':
    case 'lock_confirming':
      return 'locking_dev_tokens';
    case 'lock_confirmed':
    case 'lock_verifying':
      return 'verifying_lock';
    case 'lock_verified':
    case 'complete':
      return 'lock_verified';
    case 'recoverable_failure':
      return 'failed';
    default:
      return 'idle';
  }
}

async function fetchSchemaReady(): Promise<boolean> {
  try {
    const res = await fetch('/api/launch/pons-schema-ready', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ready?: boolean };
    return body.ready === true;
  } catch {
    return false;
  }
}

/** Client helper for LaunchFlowLive preflight / disable reason. */
export async function checkPublicPonsSchemaReady(): Promise<{
  ready: boolean;
  reason: string | null;
}> {
  const ready = await fetchSchemaReady();
  return {
    ready,
    reason: ready ? null : PONS_SCHEMA_BLOCKED_MESSAGE,
  };
}

/**
 * Full public sequence: pin → draft → Pons prepare/broadcast → HoodLock → lock_verified.
 * Does not poll indexer — caller starts runLaunchCompletion after lock_verified.
 */
export async function runPublicPonsLaunch(
  input: RunPublicPonsLaunchInput,
): Promise<RunPublicPonsLaunchResult> {
  const { callbacks } = input;

  if (!input.schemaReady) {
    return fail(callbacks, PONS_SCHEMA_BLOCKED_MESSAGE);
  }

  if (isArtworkBlockingLaunch(input.state)) {
    return fail(callbacks, 'Finishing your token image…');
  }

  if (input.liveChainId != null && input.liveChainId !== ROBINHOOD_CHAIN_ID) {
    return fail(callbacks, `Switch to Robinhood Chain (${ROBINHOOD_CHAIN_ID}).`);
  }

  const existing = loadPonsPendingLaunch(input.draftId);
  if (existing && isLaunchCommitted(existing)) {
    return resumePublicPonsLaunch({
      draftId: input.draftId,
      publicClient: input.publicClient,
      walletClient: input.walletClient,
      getLiveAccount: input.getLiveAccount,
      callbacks,
      state: input.state,
    });
  }

  callbacks.onPhase({ phase: 'preparing_artwork', error: null });

  let imageUri: string;
  let imageAfterPin: TokenImageState = input.state.image;
  try {
    const pinned = await ensureArtworkPinned({
      image: input.state.image,
      draftId: input.state.sourceDraftId,
    });
    imageUri = pinned.ipfsUri;
    imageAfterPin = {
      ...input.state.image,
      ipfsUri: pinned.ipfsUri,
      persistence: 'ipfs_ready',
      displayImagePath:
        pinned.displayImagePath ?? input.state.image.displayImagePath ?? null,
    };
    if (
      !pinned.reused ||
      input.state.image.ipfsUri !== pinned.ipfsUri ||
      imageAfterPin.displayImagePath !== input.state.image.displayImagePath
    ) {
      callbacks.onImagePinned(imageAfterPin);
    }
  } catch (e) {
    return fail(callbacks, userFacingError(e));
  }

  const buy = parseEthDevBuyWei(input.state.devBuyAmount);
  if (!buy.ok || buy.amount <= BigInt(0)) {
    return fail(
      callbacks,
      buy.ok ? 'Dev buy must be greater than zero.' : buy.error,
    );
  }

  const creator = getAddress(input.liveAddress) as `0x${string}`;
  let pending = createOrResumePonsDraft({
    draftId: input.draftId,
    creator,
    name: input.state.name.trim(),
    symbol: input.state.ticker.trim().toUpperCase().replace(/^\$/, ''),
    logo: imageUri,
    description: input.state.description.trim(),
    twitter: input.state.twitter.trim(),
    telegram: input.state.telegram.trim(),
    website: input.state.website.trim(),
    discord: '',
    farcaster: '',
    quoteInWei: buy.amount,
    creatorTaxBps: 0,
    buybackEnabled: true,
    slippageBps: PONS_DEV_BUY_SLIPPAGE_BPS,
  });
  callbacks.onPendingState?.(pending);

  if (isLaunchCommitted(pending)) {
    return resumePublicPonsLaunch({
      draftId: input.draftId,
      publicClient: input.publicClient,
      walletClient: input.walletClient,
      getLiveAccount: input.getLiveAccount,
      callbacks,
      state: { ...input.state, image: imageAfterPin },
    });
  }

  callbacks.onPhase({ phase: 'simulating', error: null });

  let prepared;
  try {
    prepared = await preparePonsLaunchAndBuy({
      publicClient: input.publicClient,
      draftId: input.draftId,
      chainId: ROBINHOOD_CHAIN_ID,
    });
    pending = prepared.state;
    callbacks.onPendingState?.(pending);
  } catch (e) {
    return fail(callbacks, userFacingError(e), {}, loadPonsPendingLaunch(input.draftId));
  }

  const live = input.getLiveAccount();
  if (!live.address || getAddress(live.address) !== creator) {
    return fail(
      callbacks,
      'Wallet changed before launch. Reconnect the same account and try again.',
      {},
      pending,
    );
  }
  if (live.chainId != null && live.chainId !== ROBINHOOD_CHAIN_ID) {
    return fail(
      callbacks,
      `Switch to Robinhood Chain (${ROBINHOOD_CHAIN_ID}).`,
      {},
      pending,
    );
  }

  callbacks.onPhase({ phase: 'awaiting_wallet', error: null });

  try {
    const broadcast = await broadcastPonsLaunchAndBuy({
      publicClient: input.publicClient,
      draftId: input.draftId,
      request: prepared.request,
      writeContract: async (request) => {
        callbacks.onPhase({ phase: 'awaiting_wallet', error: null });
        const hash = await input.walletClient.writeContract({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: [...request.args],
          value: request.value,
          account: request.account,
          chain: null,
        });
        callbacks.onPhase({
          phase: 'submitted',
          txHash: hash,
          error: null,
        });
        return hash;
      },
    });
    pending = broadcast.state;
    callbacks.onPendingState?.(pending);
    callbacks.onPhase({
      phase: 'lock_required',
      txHash: broadcast.ponsTxHash,
      expectedDeployer: creator,
      expectedCreatorId: creatorIdFromWallet(creator),
      decoded: ponsPendingToDecoded(pending),
      provenance: {
        sourceProvider: input.state.sourceProvider,
        sourceProviderArticleId: input.state.sourceProviderArticleId,
        sourceDraftId: input.state.sourceDraftId,
      },
      error: null,
    });
  } catch (e) {
    const mid = loadPonsPendingLaunch(input.draftId);
    if (mid?.ponsTxHash) {
      callbacks.onPhase({
        phase: 'failed',
        txHash: mid.ponsTxHash,
        error: userFacingError(e),
        decoded: ponsPendingToDecoded(mid),
        expectedDeployer: creator,
        expectedCreatorId: creatorIdFromWallet(creator),
      });
      return { ok: false, state: { ...INITIAL_LAUNCH_TX_STATE, phase: 'failed', error: userFacingError(e), txHash: mid.ponsTxHash }, pending: mid };
    }
    return fail(callbacks, userFacingError(e), {}, mid);
  }

  return finishHoodlockAndVerify({
    draftId: input.draftId,
    publicClient: input.publicClient,
    walletClient: input.walletClient,
    getLiveAccount: input.getLiveAccount,
    callbacks,
    formState: { ...input.state, image: imageAfterPin },
  });
}

/**
 * Resume after refresh when ponsTxHash / HoodLock progress already exists.
 */
export async function resumePublicPonsLaunch(args: {
  draftId: string;
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  getLiveAccount: () => {
    address: `0x${string}` | undefined;
    chainId: number | undefined;
  };
  callbacks: PublicPonsLaunchCallbacks;
  state: LaunchFormState;
}): Promise<RunPublicPonsLaunchResult> {
  const { callbacks } = args;
  let pending = loadPonsPendingLaunch(args.draftId);
  if (!pending) {
    return fail(callbacks, 'No pending Pons launch to resume.');
  }

  if (pending.ponsTxHash && (!pending.tokenAddress || !pending.devTokensOut)) {
    callbacks.onPhase({
      phase: 'confirming',
      txHash: pending.ponsTxHash,
      error: 'Your token launch has already been submitted. Do not launch again.',
    });
    try {
      const recovered = await recoverPonsLaunchFromPending({
        publicClient: args.publicClient,
        draftId: args.draftId,
      });
      pending = recovered.state;
      callbacks.onPendingState?.(pending);
    } catch (e) {
      return fail(
        callbacks,
        userFacingError(e),
        { txHash: pending.ponsTxHash },
        pending,
      );
    }
  }

  if (pending.hoodlockVerified || pending.phase === 'lock_verified') {
    return successFromPending(callbacks, pending, args.state);
  }

  if (isLockCommitted(pending) || pending.hoodlockLockTxHash) {
    callbacks.onPhase({
      phase: 'verifying_lock',
      txHash: pending.ponsTxHash,
      decoded: ponsPendingToDecoded(pending),
      error: 'Lock transaction already submitted. Checking its status…',
    });
    try {
      const recovered = await recoverHoodlockFromPending({
        publicClient: args.publicClient,
        draftId: args.draftId,
      });
      pending = recovered.state;
      callbacks.onPendingState?.(pending);
      if (pending.hoodlockVerified) {
        return successFromPending(callbacks, pending, args.state);
      }
    } catch (e) {
      return fail(
        callbacks,
        userFacingError(e),
        {
          txHash: pending.ponsTxHash,
          decoded: ponsPendingToDecoded(pending),
          phase: 'failed',
        },
        pending,
      );
    }
  }

  if (!pending.tokenAddress || !pending.devTokensOut) {
    return fail(
      callbacks,
      'Token launched successfully. Dev-token lock is incomplete. Resume locking.',
      {
        txHash: pending.ponsTxHash,
        decoded: ponsPendingToDecoded(pending),
        phase: 'lock_required',
      },
      pending,
    );
  }

  return finishHoodlockAndVerify({
    draftId: args.draftId,
    publicClient: args.publicClient,
    walletClient: args.walletClient,
    getLiveAccount: args.getLiveAccount,
    callbacks,
    formState: args.state,
  });
}

async function finishHoodlockAndVerify(args: {
  draftId: string;
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  getLiveAccount: () => {
    address: `0x${string}` | undefined;
    chainId: number | undefined;
  };
  callbacks: PublicPonsLaunchCallbacks;
  formState: LaunchFormState;
}): Promise<RunPublicPonsLaunchResult> {
  const { callbacks } = args;
  let pending = loadPonsPendingLaunch(args.draftId);
  if (!pending?.tokenAddress || !pending.devTokensOut) {
    return fail(
      callbacks,
      'Token launched successfully. Dev-token lock is incomplete. Resume locking.',
      { txHash: pending?.ponsTxHash ?? null, phase: 'lock_required' },
      pending,
    );
  }

  callbacks.onPhase({
    phase: 'lock_preparing',
    txHash: pending.ponsTxHash,
    decoded: ponsPendingToDecoded(pending),
    error: null,
  });

  try {
    const prepared = await prepareHoodlockLock({
      publicClient: args.publicClient,
      draftId: args.draftId,
      chainId: ROBINHOOD_CHAIN_ID,
    });
    pending = prepared.state;
    callbacks.onPendingState?.(pending);

    if (pending.hoodlockVerified) {
      return successFromPending(callbacks, pending, args.formState);
    }

    if (prepared.approvalRequired && prepared.approvalRequest) {
      callbacks.onPhase({
        phase: 'approving_lock',
        txHash: pending.ponsTxHash,
        decoded: ponsPendingToDecoded(pending),
        error: null,
      });
      const approved = await broadcastHoodlockApproval({
        publicClient: args.publicClient,
        draftId: args.draftId,
        request: prepared.approvalRequest,
        writeContract: async (request) => {
          return args.walletClient.writeContract({
            address: request.address,
            abi: request.abi,
            functionName: request.functionName,
            args: [...request.args],
            account: request.account,
            chain: null,
          });
        },
      });
      pending = approved.state;
      callbacks.onPendingState?.(pending);
    }

    callbacks.onPhase({
      phase: 'awaiting_lock_wallet',
      txHash: pending.ponsTxHash,
      decoded: ponsPendingToDecoded(pending),
      error: null,
    });

    const locked = await broadcastHoodlockLock({
      publicClient: args.publicClient,
      draftId: args.draftId,
      writeContract: async (request) => {
        callbacks.onPhase({
          phase: 'locking_dev_tokens',
          txHash: pending!.ponsTxHash,
          decoded: ponsPendingToDecoded(pending!),
          error: null,
        });
        return args.walletClient.writeContract({
          address: request.address,
          abi: request.abi,
          functionName: request.functionName,
          args: [...request.args],
          value: request.value,
          account: request.account,
          chain: null,
        });
      },
    });
    pending = locked.state;
    callbacks.onPendingState?.(pending);
  } catch (e) {
    const mid = loadPonsPendingLaunch(args.draftId);
    return fail(
      callbacks,
      mid?.ponsTxHash
        ? `Token launched successfully. Dev-token lock is incomplete. Resume locking. (${userFacingError(e)})`
        : userFacingError(e),
      {
        txHash: mid?.ponsTxHash ?? null,
        decoded: mid ? ponsPendingToDecoded(mid) : null,
        phase: mid?.ponsTxHash ? 'lock_required' : 'failed',
      },
      mid,
    );
  }

  pending = loadPonsPendingLaunch(args.draftId);
  if (!pending?.hoodlockVerified) {
    return fail(
      callbacks,
      'Token launched successfully. Dev-token lock is incomplete. Resume locking.',
      {
        txHash: pending?.ponsTxHash ?? null,
        decoded: pending ? ponsPendingToDecoded(pending) : null,
        phase: 'lock_required',
      },
      pending,
    );
  }

  return successFromPending(callbacks, pending, args.formState);
}

function successFromPending(
  callbacks: PublicPonsLaunchCallbacks,
  pending: PonsPendingLaunchState,
  formState: LaunchFormState,
): RunPublicPonsLaunchResult {
  const decoded = ponsPendingToDecoded(pending);
  const creator = getAddress(pending.creator) as `0x${string}`;
  const state: LaunchTxState = {
    ...INITIAL_LAUNCH_TX_STATE,
    phase: 'lock_verified',
    txHash: pending.ponsTxHash,
    expectedDeployer: creator,
    expectedCreatorId: creatorIdFromWallet(creator),
    decoded,
    detailsPending: false,
    provenance: {
      sourceProvider: formState.sourceProvider,
      sourceProviderArticleId: formState.sourceProviderArticleId,
      sourceDraftId: formState.sourceDraftId,
    },
    error: null,
  };
  callbacks.onPhase(state);
  callbacks.onPendingState?.(pending);
  return { ok: true, draftId: pending.draftId, state, pending };
}
