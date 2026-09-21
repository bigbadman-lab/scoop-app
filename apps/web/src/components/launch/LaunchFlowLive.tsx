'use client';

import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  createInitialLaunchState,
  type FieldErrors,
  type LaunchFormState,
  type LaunchStepId,
  type TokenImageState,
} from '@/lib/launch/types';
import { launchReducer } from '@/lib/launch/state';
import {
  compatibleAssistWebsite,
  isArtworkBlockingLaunch,
  validateDevBuyStep,
  validatePumpRouteStep,
  validateTokenStep,
} from '@/lib/launch/validation';
import { LAUNCH_WRITE_ENABLED } from '@/lib/launch/execute';
import {
  checkPublicPonsSchemaReady,
  PONS_SCHEMA_BLOCKED_MESSAGE,
  resumePublicPonsLaunch,
  runPublicPonsLaunch,
} from '@/lib/launch/run-public-pons-launch';
import { runPublicPumpLaunch } from '@/lib/launch/run-public-pump-launch';
import { completePublicPumpLaunch } from '@/lib/launch/complete-public-pump-launch';
import { runLaunchCompletion } from '@/lib/launch/complete-launch';
import { activateNewsArticleMarket } from '@/lib/news/activate-article-market';
import {
  clearPendingLaunchCompletion,
  loadPendingLaunchCompletion,
  savePendingLaunchCompletion,
} from '@/lib/launch/pending-completion';
import { saveFreshLaunchHandoff } from '@/lib/launch/fresh-launch-handoff';
import { savePumpSuccessHandoff } from '@/lib/launch/pump-success-handoff';
import { canShowViewMarket } from '@/lib/launch/completion-panel-copy';
import {
  INITIAL_LAUNCH_TX_STATE,
  isLaunchCompletionActive,
  isLaunchTxBusy,
  isMarketLivePhase,
  isPostBroadcastRelaunchBlocked,
  tokenMarketPath,
  type LaunchTxState,
} from '@/lib/launch/tx-state';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { consumeAssistedLaunchHandoff } from '@/lib/launch-assist/handoff';
import type { LaunchAssistArticle } from '@/lib/launch-assist/types';
import { isPumpRail, type LaunchRail } from '@/lib/launch/launch-rail';
import type { LaunchResult } from '@/lib/launch/launch-result';
import { LaunchProgress } from '@/components/launch/LaunchProgress';
import { LaunchNav } from '@/components/launch/LaunchNav';
import { LaunchRailSelector } from '@/components/launch/LaunchRailSelector';
import { TokenStep } from '@/components/launch/steps/TokenStep';
import { DevBuyStep } from '@/components/launch/steps/DevBuyStep';
import { PumpRouteStep } from '@/components/launch/PumpRouteStep';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';
import {
  isLaunchCommitted,
  listPonsPendingLaunches,
} from '@/lib/launch/adapters/pons';
import {
  devSupplyOption,
  isBurnDevSupplyPolicy,
  resolveDevSupplyPolicy,
} from '@/lib/launch/dev-supply-policy';
import { isPublicCreatorFeeBps } from '@/lib/launch/creator-fee';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana/react';
import { useScoopWalletSession } from '@/lib/auth/use-scoop-wallet-session';
import { getLaunchRailCompatibility } from '@/lib/launch/rail-compatibility';

type Props = {
  catalogue: PublicQuoteCatalogueItem[];
};

type ArtworkNotice = { kind: 'ready' } | { kind: 'regenerated' } | { kind: 'failed' };

function imageFromHandoff(
  handoff: NonNullable<ReturnType<typeof consumeAssistedLaunchHandoff>>,
): TokenImageState {
  if (handoff.image.source === 'pending') {
    return {
      previewUrl: null,
      fileName: null,
      mimeType: null,
      byteSize: null,
      persistence: 'local_only',
      ipfsUri: null,
      displayImagePath: null,
      source: 'ai_pending',
      artworkStatus: 'pending',
      artworkError: null,
      artworkAssetId: null,
    };
  }
  if (handoff.image.source === 'upload') {
    return {
      previewUrl: handoff.image.previewUrl,
      fileName: handoff.image.fileName,
      mimeType: handoff.image.mimeType,
      byteSize: handoff.image.byteSize,
      persistence: 'local_only',
      ipfsUri: null,
      displayImagePath: null,
      source: 'user',
      artworkStatus: 'ready',
      artworkError: null,
      artworkAssetId: null,
    };
  }
  return {
    previewUrl: handoff.image.previewUrl,
    fileName: handoff.image.fileName,
    mimeType: handoff.image.mimeType,
    byteSize: handoff.image.byteSize,
    persistence: 'local_only',
    ipfsUri: null,
    displayImagePath: null,
    source: 'ai',
    artworkStatus: 'ready',
    artworkError: null,
    artworkAssetId: handoff.image.artworkAssetId,
  };
}

function resolveSourceDraftId(
  handoff: NonNullable<ReturnType<typeof consumeAssistedLaunchHandoff>>,
): string | null {
  if (handoff.draftId) return handoff.draftId;
  if (handoff.image.source === 'pending' || handoff.image.source === 'generated') {
    return handoff.image.draftId;
  }
  return null;
}

function applyAssistedPrefill(): {
  prefill: Partial<LaunchFormState> | null;
  provenance: LaunchAssistArticle | null;
  quoteWarning: string | null;
} {
  const handoff = consumeAssistedLaunchHandoff();
  if (!handoff) {
    return { prefill: null, provenance: null, quoteWarning: null };
  }

  // Gate 7: public Pons path is ETH-only — ignore legacy recommended quote pairs.
  let quoteWarning: string | null = null;
  const recommended = handoff.quoteAsset.trim().toLowerCase();
  if (
    recommended &&
    recommended !== '0x0000000000000000000000000000000000000000'
  ) {
    quoteWarning =
      'This story suggested a non-ETH pair. Public launches now use ETH only.';
  }

  return {
    provenance: handoff.article,
    quoteWarning,
    prefill: {
      name: handoff.concept.name,
      ticker: handoff.concept.ticker.trim().toUpperCase().replace(/^\$/, ''),
      description: handoff.concept.description,
      website: compatibleAssistWebsite(handoff.article.url),
      quoteAsset: '0x0000000000000000000000000000000000000000',
      quoteSymbol: 'ETH',
      quoteDecimals: 18,
      sourceProvider: 'stocknewsapi',
      sourceProviderArticleId: handoff.providerArticleId,
      sourceDraftId: resolveSourceDraftId(handoff),
      image: imageFromHandoff(handoff),
    },
  };
}

function ArtworkFlowNotice({
  notice,
  onViewImage,
  onDismiss,
}: {
  notice: ArtworkNotice;
  onViewImage: () => void;
  onDismiss: () => void;
}) {
  const title =
    notice.kind === 'failed'
      ? 'Image generation failed'
      : notice.kind === 'regenerated'
        ? 'New image generated'
        : 'Image generated';
  const actionLabel = notice.kind === 'failed' ? 'Return to image' : 'View image';

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-2.5"
      role="status"
      aria-live="polite"
      data-testid="artwork-flow-notice"
    >
      <p className="text-sm text-[var(--fg)]">
        {title}
        {notice.kind !== 'failed' ? (
          <span className="text-[var(--muted)]" aria-hidden="true">
            {' '}
            ✓
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-green)] underline-offset-4 hover:underline"
          onClick={onViewImage}
        >
          {actionLabel}
        </button>
        {notice.kind === 'failed' ? (
          <button
            type="button"
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : (
          <button
            type="button"
            className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
            onClick={onDismiss}
            aria-label="Dismiss image notification"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function LaunchFlowInner({ catalogue }: Props) {
  // Catalogue retained for LaunchFlow shell API; public Pons path is ETH-fixed.
  void catalogue;
  const searchParams = useSearchParams();
  const router = useRouter();
  const assist = searchParams.get('assist') === '1';
  const { address: connectedAddress, chainId: accountChainId } = useAccount();
  const publicClient = usePublicClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { data: walletClient } = useWalletClient({ chainId: ROBINHOOD_CHAIN_ID });
  const { switchChainAsync } = useSwitchChain();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider: solanaWalletProvider } =
    useAppKitProvider<SolanaProvider>('solana');
  const solanaAddress = solanaAccount.address ?? null;
  const walletSession = useScoopWalletSession();
  const applied = useRef(false);
  const launchInFlight = useRef(false);
  const pumpAttemptIdRef = useRef<string | null>(null);
  const pumpSignatureRef = useRef<string | null>(null);
  const completionAbortRef = useRef<AbortController | null>(null);
  const completionKeyRef = useRef<string | null>(null);
  const resumeTriedRef = useRef(false);
  const accountRef = useRef<{
    address: `0x${string}` | undefined;
    chainId: number | undefined;
  }>({ address: undefined, chainId: undefined });
  accountRef.current = {
    address: connectedAddress,
    chainId: accountChainId,
  };
  /** Box avoids TS narrowing the ref from the poll effect's `source !== 'user'` guard. */
  const imageSourceRef = useRef<{ source: TokenImageState['source'] }>({
    source: 'none',
  });
  const stepRef = useRef<LaunchStepId>(1);
  const regeneratingRef = useRef(false);
  const previousReadyRef = useRef<TokenImageState | null>(null);

  const [state, dispatch] = useReducer(launchReducer, undefined, () => createInitialLaunchState());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [provenance, setProvenance] = useState<LaunchAssistArticle | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [artworkNotice, setArtworkNotice] = useState<ArtworkNotice | null>(null);
  const [artworkJobBusy, setArtworkJobBusy] = useState(false);
  const [tx, setTx] = useState<LaunchTxState>(INITIAL_LAUNCH_TX_STATE);
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);
  const [ponsDraftId, setPonsDraftId] = useState<string | null>(null);
  const ponsDraftIdRef = useRef<string | null>(null);
  const [pumpResult, setPumpResult] = useState<LaunchResult | null>(null);
  const [pumpPersistError, setPumpPersistError] = useState<string | null>(null);
  const pumpRail = isPumpRail(state.launchRail);
  const railCompatibility = getLaunchRailCompatibility({
    selectedRail: pumpRail ? 'pump' : 'pons',
    authenticated: walletSession.authenticated,
    walletNamespace: walletSession.namespace,
    authMethod: walletSession.authMethod,
    providerReady: walletSession.providerReady,
  });

  imageSourceRef.current.source = state.image.source;
  stepRef.current = state.step;
  regeneratingRef.current = state.image.artworkStatus === 'regenerating';

  function patchTx(partial: Partial<LaunchTxState>) {
    setTx((prev) => ({ ...prev, ...partial }));
  }

  function startCompletionFromTx(
    base: LaunchTxState,
    displayImagePath?: string | null,
    imageUriArg?: string | null,
  ) {
    if (!base.decoded?.token || !base.txHash) return;
    // Gate 7: only poll indexer after HoodLock verification (or legacy Scoop receipt).
    if (
      base.phase !== 'lock_verified' &&
      base.phase !== 'burn_verified' &&
      base.phase !== 'receipt_success' &&
      base.phase !== 'waiting_for_indexer'
    ) {
      return;
    }
    const key = `${base.txHash}:${base.decoded.token}`.toLowerCase();
    if (completionKeyRef.current === key) return;

    completionAbortRef.current?.abort();
    const ac = new AbortController();
    completionAbortRef.current = ac;
    completionKeyRef.current = key;

    const path =
      displayImagePath ??
      (typeof state.image.displayImagePath === 'string' ? state.image.displayImagePath : null);
    const imageUri =
      imageUriArg ??
      (typeof state.image.ipfsUri === 'string' && state.image.ipfsUri.startsWith('ipfs://')
        ? state.image.ipfsUri
        : null);

    savePendingLaunchCompletion({
      chainId: ROBINHOOD_CHAIN_ID,
      tokenAddress: base.decoded.token,
      txHash: base.txHash as `0x${string}`,
      expectedCreatorId: base.expectedCreatorId,
      expectedDeployer: base.expectedDeployer,
      decoded: base.decoded,
      provenance: base.provenance,
      displayImagePath: path,
      imageUri,
    });
    saveFreshLaunchHandoff({
      chainId: ROBINHOOD_CHAIN_ID,
      tokenAddress: base.decoded.token,
      txHash: base.txHash as `0x${string}`,
      name: base.decoded.name,
      symbol: base.decoded.symbol,
      quoteAsset: base.decoded.quoteAsset,
    });

    void runLaunchCompletion({
      chainId: ROBINHOOD_CHAIN_ID,
      tokenAddress: base.decoded.token,
      txHash: base.txHash as `0x${string}`,
      decoded: base.decoded,
      expectedCreatorId: base.expectedCreatorId,
      expectedDeployer: base.expectedDeployer,
      provenance: base.provenance,
      displayImagePath: path,
      imageUri,
      marketSource: 'pons_v2',
      signal: ac.signal,
      callbacks: {
        onPhase: (partial) => {
          patchTx(partial);
        },
      },
    }).then((result) => {
      if (result.status === 'market_live') {
        clearPendingLaunchCompletion();
      }
      if (result.status === 'aborted') {
        if (completionKeyRef.current === key) {
          completionKeyRef.current = null;
        }
      }
    });
  }

  function retryIndexCheck() {
    completionKeyRef.current = null;
    if (!tx.decoded || !tx.txHash) return;
    startCompletionFromTx({
      ...tx,
      phase: 'receipt_success',
      error: null,
    });
  }

  async function retryNewsLink() {
    if (!tx.decoded?.token || !tx.provenance) return;
    patchTx({ newsActivation: 'pending', phase: 'activating_news' });
    const result = await activateNewsArticleMarket({
      chainId: ROBINHOOD_CHAIN_ID,
      tokenAddress: tx.decoded.token,
      providerArticleId: tx.provenance.sourceProviderArticleId,
      draftId: tx.provenance.sourceDraftId,
    });
    if (result.ok) {
      patchTx({ newsActivation: 'ok', phase: 'market_live' });
    } else {
      patchTx({ newsActivation: 'failed', phase: 'market_live' });
    }
  }

  function viewMarket() {
    const addr = tx.indexedLaunch?.tokenAddress ?? tx.decoded?.token ?? null;
    if (!addr) return;
    if (tx.decoded && tx.txHash) {
      saveFreshLaunchHandoff({
        chainId: ROBINHOOD_CHAIN_ID,
        tokenAddress: tx.decoded.token,
        txHash: tx.txHash as `0x${string}`,
        name: tx.indexedLaunch?.name ?? tx.decoded.name,
        symbol: tx.indexedLaunch?.symbol ?? tx.decoded.symbol,
        quoteAsset: (tx.indexedLaunch?.quoteAsset ?? tx.decoded.quoteAsset) as `0x${string}`,
      });
    }
    // Keep pending completion for launch-page resume; handoff covers token-page sync.
    router.replace(tokenMarketPath(addr));
  }

  useEffect(() => {
    if (!assist || applied.current) return;
    applied.current = true;
    const { prefill, provenance: story, quoteWarning: warning } = applyAssistedPrefill();
    if (!prefill) return;
    dispatch({ type: 'PATCH', patch: prefill });
    setProvenance(story);
    setQuoteWarning(warning);
  }, [assist]);

  /** Schema readiness — fail closed until Gate 6 migration is applied. */
  useEffect(() => {
    let cancelled = false;
    void checkPublicPonsSchemaReady().then((r) => {
      if (!cancelled) setSchemaReady(r.ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Resume pending Pons / HoodLock / indexer wait after refresh. */
  useEffect(() => {
    if (resumeTriedRef.current) return;
    resumeTriedRef.current = true;

    const ponsPending = listPonsPendingLaunches()[0] ?? null;
    if (ponsPending && isLaunchCommitted(ponsPending)) {
      ponsDraftIdRef.current = ponsPending.draftId;
      setPonsDraftId(ponsPending.draftId);
      dispatch({ type: 'SET_STEP', step: 3 });
      const resumedPolicy = resolveDevSupplyPolicy(ponsPending.devSupplyPolicy);
      const resumedBurn = isBurnDevSupplyPolicy(resumedPolicy);
      const allocationDone = resumedBurn
        ? ponsPending.burnVerified === true
        : ponsPending.hoodlockVerified === true;
      dispatch({
        type: 'PATCH',
        patch: {
          name: ponsPending.name,
          ticker: ponsPending.symbol,
          description: ponsPending.description,
          twitter: ponsPending.twitter,
          telegram: ponsPending.telegram,
          website: ponsPending.website,
          devSupplyPolicy: resumedPolicy,
          ...(isPublicCreatorFeeBps(ponsPending.creatorTaxBps)
            ? { creatorFeeBps: ponsPending.creatorTaxBps }
            : {}),
          devBuyAmount:
            ponsPending.quoteInWei && ponsPending.quoteInWei !== '0'
              ? '' // amount already committed; UI shows recovery, not editable buy
              : '',
        },
      });
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: allocationDone
          ? resumedBurn
            ? 'burn_verified'
            : 'lock_verified'
          : 'lock_required',
        txHash: ponsPending.ponsTxHash,
        persistedCreatorTaxBps: ponsPending.creatorTaxBps,
        decoded: ponsPending.tokenAddress
          ? {
              token: ponsPending.tokenAddress,
              deployer: ponsPending.creator,
              creatorId: ponsPending.creator,
              quoteAsset: '0x0000000000000000000000000000000000000000',
              feeDistributor: '0x0000000000000000000000000000000000000000',
              liquidityLocker: '0x0000000000000000000000000000000000000000',
              poolId:
                '0x0000000000000000000000000000000000000000000000000000000000000000',
              lpTokenId: '0',
              name: ponsPending.name,
              symbol: ponsPending.symbol,
            }
          : null,
        error: allocationDone
          ? null
          : resumedBurn
            ? 'Token launched successfully. Dev-supply burn is incomplete. Resume burn.'
            : 'Token launched successfully. Dev-token lock is incomplete. Resume locking.',
      });
      return;
    }

    const pending = loadPendingLaunchCompletion();
    if (!pending) return;
    dispatch({ type: 'SET_STEP', step: 3 });
    const restored: LaunchTxState = {
      ...INITIAL_LAUNCH_TX_STATE,
      phase: 'lock_verified',
      txHash: pending.txHash,
      expectedCreatorId: pending.expectedCreatorId,
      expectedDeployer: pending.expectedDeployer,
      decoded: pending.decoded,
      detailsPending: false,
      provenance: pending.provenance,
    };
    setTx(restored);
    startCompletionFromTx(restored, pending.displayImagePath, pending.imageUri);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only resume
  }, []);

  /** After lock or burn verification, start indexer completion once. */
  useEffect(() => {
    if (
      (tx.phase !== 'lock_verified' && tx.phase !== 'burn_verified') ||
      !tx.decoded?.token ||
      !tx.txHash
    ) {
      return;
    }
    startCompletionFromTx(tx);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by phase+hash+token
  }, [tx.phase, tx.txHash, tx.decoded?.token]);

  useEffect(() => {
    return () => {
      completionAbortRef.current?.abort();
    };
  }, []);

  /** Poll durable draft artwork; merge image fields only (never text/pair). */
  useEffect(() => {
    const draftId = state.sourceDraftId;
    const shouldPoll =
      Boolean(draftId) &&
      state.image.source !== 'user' &&
      (state.image.source === 'ai_pending' ||
        state.image.artworkStatus === 'pending' ||
        state.image.artworkStatus === 'generating' ||
        state.image.artworkStatus === 'regenerating' ||
        state.image.artworkStatus === 'failed');
    if (!shouldPoll || !draftId) return;

    const pollDraftId = draftId;
    let cancelled = false;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    async function poll() {
      try {
        const res = await fetch(
          `/api/launch-assist/artwork/status?draftId=${encodeURIComponent(pollDraftId)}`,
          { credentials: 'include', cache: 'no-store' },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          artworkStatus?: string;
          artworkError?: string | null;
          previewUrl?: string | null;
          artworkAssetId?: string | null;
          mimeType?: string | null;
          displayImagePath?: string | null;
        };
        if (cancelled) return;
        if (imageSourceRef.current.source === 'user') return;

        if (data.artworkStatus === 'ready' && data.previewUrl) {
          const wasRegen = regeneratingRef.current;
          console.info(
            JSON.stringify({
              event: 'launch_assist_artwork_ready',
              ms: Math.round(
                (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
              ),
              draftId: pollDraftId,
              regenerated: wasRegen,
              hasDisplayPath: Boolean(data.displayImagePath?.trim()),
            }),
          );
          setArtworkJobBusy(false);
          previousReadyRef.current = null;
          dispatch({
            type: 'SET_IMAGE',
            image: {
              previewUrl: data.previewUrl,
              fileName: 'ai-artwork.png',
              mimeType: data.mimeType ?? 'image/png',
              byteSize: null,
              persistence: 'local_only',
              ipfsUri: null,
              displayImagePath: data.displayImagePath?.trim() || null,
              source: 'ai',
              artworkStatus: 'ready',
              artworkError: null,
              artworkAssetId: data.artworkAssetId ?? null,
            },
          });
          if (stepRef.current !== 1) {
            setArtworkNotice({ kind: wasRegen ? 'regenerated' : 'ready' });
          } else {
            setArtworkNotice(null);
          }
          return;
        }

        if (data.artworkStatus === 'failed') {
          console.info(
            JSON.stringify({
              event: 'launch_assist_artwork_failed',
              draftId: pollDraftId,
            }),
          );
          setArtworkJobBusy(false);
          const prior = previousReadyRef.current;
          if (prior?.previewUrl) {
            previousReadyRef.current = null;
            dispatch({ type: 'SET_IMAGE', image: { ...prior, artworkStatus: 'ready' } });
            if (stepRef.current !== 1) {
              setArtworkNotice({ kind: 'failed' });
            }
            return;
          }
          dispatch({
            type: 'SET_IMAGE',
            image: {
              previewUrl: null,
              fileName: null,
              mimeType: null,
              byteSize: null,
              persistence: 'local_only',
              ipfsUri: null,
              displayImagePath: null,
              source: 'ai_pending',
              artworkStatus: 'failed',
              artworkError: data.artworkError ?? 'Artwork generation failed',
              artworkAssetId: null,
            },
          });
          if (stepRef.current !== 1) {
            setArtworkNotice({ kind: 'failed' });
          }
        }
      } catch {
        /* keep polling */
      }
    }

    void poll();
    if (state.image.artworkStatus === 'failed') {
      return () => {
        cancelled = true;
      };
    }
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [state.sourceDraftId, state.image.source, state.image.artworkStatus]);

  const stepErrors = useMemo(() => {
    if (!attempted) return {} as FieldErrors;
    if (state.step === 1) return validateTokenStep(state);
    if (state.step === 2) {
      return pumpRail
        ? validatePumpRouteStep(state, solanaAddress)
        : validateDevBuyStep(state);
    }
    return {};
  }, [attempted, state, pumpRail, solanaAddress]);

  const visibleErrors = attempted ? { ...errors, ...stepErrors } : errors;
  const artworkBlockingLaunch = isArtworkBlockingLaunch(state);

  function goBack() {
    if (state.step <= 1) return;
    setAttempted(false);
    setErrors({});
    dispatch({ type: 'SET_STEP', step: (state.step - 1) as LaunchStepId });
  }

  function goContinue() {
    setAttempted(true);
    if (state.step === 1) {
      const next = validateTokenStep(state);
      setErrors(next);
      if (Object.keys(next).length) return;
      dispatch({ type: 'SET_STEP', step: 2 });
      setAttempted(false);
      return;
    }
    if (state.step === 2) {
      if (pumpRail) {
        dispatch({ type: 'SET_STEP', step: 3 });
        setAttempted(false);
        return;
      }
      const next = validateDevBuyStep(state);
      setErrors(next);
      if (Object.keys(next).length) return;
      dispatch({ type: 'SET_STEP', step: 3 });
      setAttempted(false);
    }
  }

  function onLaunchRailChange(rail: LaunchRail) {
    if (
      rail.chain === state.launchRail.chain &&
      rail.provider === state.launchRail.provider
    ) {
      return;
    }
    // Changing rail invalidates route-specific progress / pump attempt.
    setPumpResult(null);
    setPumpPersistError(null);
    pumpAttemptIdRef.current = null;
    pumpSignatureRef.current = null;
    setTx(INITIAL_LAUNCH_TX_STATE);
    setErrors({});
    setAttempted(false);
    dispatch({ type: 'PATCH', patch: { launchRail: rail } });
  }

  function viewImageFromNotice() {
    setArtworkNotice(null);
    setAttempted(false);
    setErrors({});
    dispatch({ type: 'SET_STEP', step: 1 });
  }

  async function startArtworkJob(mode: 'retry' | 'regenerate') {
    const draftId = state.sourceDraftId;
    if (!draftId || state.image.source === 'user') return;
    if (artworkJobBusy) return;
    if (
      state.image.artworkStatus === 'pending' ||
      state.image.artworkStatus === 'generating' ||
      state.image.artworkStatus === 'regenerating'
    ) {
      return;
    }

    setArtworkJobBusy(true);
    setArtworkNotice(null);

    if (mode === 'regenerate' && state.image.previewUrl) {
      previousReadyRef.current = { ...state.image };
      dispatch({
        type: 'SET_IMAGE',
        image: {
          ...state.image,
          artworkStatus: 'regenerating',
          artworkError: null,
        },
      });
    } else {
      previousReadyRef.current = null;
      dispatch({
        type: 'SET_IMAGE',
        image: {
          previewUrl: null,
          fileName: null,
          mimeType: null,
          byteSize: null,
          persistence: 'local_only',
          ipfsUri: null,
          displayImagePath: null,
          source: 'ai_pending',
          artworkStatus: 'pending',
          artworkError: null,
          artworkAssetId: null,
        },
      });
    }

    try {
      const res = await fetch('/api/launch-assist/artwork/retry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, force: mode === 'regenerate' }),
      });
      if (!res.ok) {
        throw new Error('retry failed');
      }
    } catch {
      setArtworkJobBusy(false);
      const prior = previousReadyRef.current;
      previousReadyRef.current = null;
      if (prior?.previewUrl) {
        dispatch({ type: 'SET_IMAGE', image: { ...prior, artworkStatus: 'ready' } });
      } else {
        dispatch({
          type: 'SET_IMAGE',
          image: {
            previewUrl: null,
            fileName: null,
            mimeType: null,
            byteSize: null,
            persistence: 'local_only',
            ipfsUri: null,
            displayImagePath: null,
            source: 'ai_pending',
            artworkStatus: 'failed',
            artworkError: 'Could not start artwork.',
            artworkAssetId: null,
          },
        });
      }
    }
  }

  const launchDisabledReason =
    state.step === 3
      ? artworkBlockingLaunch
        ? 'Finishing your token image…'
        : pumpRail && pumpResult
          ? 'Pump launch complete'
          : pumpRail && pumpSignatureRef.current
            ? 'Transaction already submitted — check explorer before a fresh launch'
            : isPostBroadcastRelaunchBlocked(tx.phase) && tx.phase !== 'lock_required'
              ? isMarketLivePhase(tx.phase)
                ? 'Market is live'
                : tx.phase === 'indexing_timeout'
                  ? 'Launch confirmed — indexing delayed'
                  : tx.phase === 'index_mismatch'
                    ? 'Indexed launch mismatch'
                    : isLaunchTxBusy(tx.phase)
                      ? launchTxBusyReason(tx.phase, state.devSupplyPolicy, pumpRail)
                      : 'Launch transaction already submitted'
              : isLaunchTxBusy(tx.phase)
                ? launchTxBusyReason(tx.phase, state.devSupplyPolicy, pumpRail)
                : !LAUNCH_WRITE_ENABLED
                  ? 'Launch submission is disabled.'
                  : pumpRail
                    ? !railCompatibility.canLaunch
                      ? railCompatibility.message ?? 'Sign in to launch.'
                      : !walletSession.providerReady
                        ? 'Solana wallet provider not ready'
                        : undefined
                    : !railCompatibility.canLaunch
                      ? railCompatibility.message ?? 'Sign in to launch.'
                      : schemaReady === false
                      ? PONS_SCHEMA_BLOCKED_MESSAGE
                      : schemaReady == null
                        ? 'Checking Pons indexing schema…'
                        : !connectedAddress
                          ? 'Connect a wallet to launch'
                          : accountChainId != null && accountChainId !== ROBINHOOD_CHAIN_ID
                            ? 'Switch to Robinhood Chain (4663)'
                            : undefined
      : undefined;

  async function submitPumpLaunch() {
    if (!railCompatibility.canLaunch || walletSession.authMethod !== 'siws') {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error: railCompatibility.message ?? 'Sign in with a Solana wallet to launch.',
      });
      return;
    }
    if (!solanaAddress || !solanaWalletProvider || !walletSession.providerReady) {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error: 'Connect a Solana wallet to launch.',
      });
      return;
    }
    if (pumpSignatureRef.current) {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        txHash: pumpSignatureRef.current,
        error: `A Pump transaction was already submitted. Check the explorer before starting a fresh launch.`,
      });
      return;
    }

    launchInFlight.current = true;
    setTx({ ...INITIAL_LAUNCH_TX_STATE, phase: 'preparing_artwork' });
    try {
      const outcome = await runPublicPumpLaunch({
        state,
        walletAddress: solanaAddress,
        walletProvider: solanaWalletProvider,
        priorAttemptId: pumpAttemptIdRef.current,
        priorSignature: pumpSignatureRef.current,
        onPhase: (phase) => {
          setTx((prev) => ({ ...prev, phase, error: null }));
        },
        onImagePinned: (image) => {
          dispatch({ type: 'SET_IMAGE', image });
        },
        onMintAttempt: (attemptId) => {
          pumpAttemptIdRef.current = attemptId;
        },
      });

      if (!outcome.ok) {
        if (outcome.signature) {
          pumpSignatureRef.current = outcome.signature;
        }
        if (outcome.attemptId) {
          pumpAttemptIdRef.current = outcome.attemptId;
        }
        setTx({
          ...INITIAL_LAUNCH_TX_STATE,
          phase: 'failed',
          txHash: outcome.signature ?? null,
          error: outcome.error,
        });
        return;
      }

      pumpSignatureRef.current = outcome.signature;
      setPumpResult(outcome.result);
      savePumpSuccessHandoff({
        result: outcome.result,
        name: state.name.trim(),
        symbol: state.ticker.trim(),
        description: state.description.trim(),
        imageIpfsUri: state.image.ipfsUri,
        sourceProvider: state.sourceProvider,
        sourceProviderArticleId: state.sourceProviderArticleId,
        sourceDraftId: state.sourceDraftId,
      });
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'waiting_for_indexer',
        txHash: outcome.signature,
      });

      const persisted = await completePublicPumpLaunch({
        result: outcome.result,
        state,
        creatorWallet: solanaAddress,
      });
      if (!persisted.ok) {
        setPumpPersistError(persisted.error);
        setTx({
          ...INITIAL_LAUNCH_TX_STATE,
          phase: 'failed',
          txHash: outcome.signature,
          error: `Launch confirmed on Solana, but SCOOP could not save the market yet: ${persisted.error}`,
        });
        return;
      }

      setPumpPersistError(null);
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'market_live',
        txHash: outcome.signature,
      });
      router.replace(persisted.tokenPath);
    } finally {
      launchInFlight.current = false;
    }
  }

  async function retryPumpPersist() {
    if (!pumpResult || !solanaAddress) return;
    if (launchInFlight.current) return;
    launchInFlight.current = true;
    setPumpPersistError(null);
    setTx((prev) => ({
      ...prev,
      phase: 'waiting_for_indexer',
      error: null,
    }));
    try {
      const persisted = await completePublicPumpLaunch({
        result: pumpResult,
        state,
        creatorWallet: solanaAddress,
      });
      if (!persisted.ok) {
        setPumpPersistError(persisted.error);
        setTx({
          ...INITIAL_LAUNCH_TX_STATE,
          phase: 'failed',
          txHash: pumpResult.txHash,
          error: `Launch confirmed on Solana, but SCOOP could not save the market yet: ${persisted.error}`,
        });
        return;
      }
      setPumpPersistError(null);
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'market_live',
        txHash: pumpResult.txHash,
      });
      router.replace(persisted.tokenPath);
    } finally {
      launchInFlight.current = false;
    }
  }

  async function submitLaunch() {
    if (state.step !== 3) return;
    if (launchInFlight.current || isLaunchTxBusy(tx.phase)) return;
    if (artworkBlockingLaunch) return;

    if (pumpRail) {
      if (pumpResult && pumpPersistError) {
        await retryPumpPersist();
        return;
      }
      if (pumpResult) return;
      await submitPumpLaunch();
      return;
    }

    if (!railCompatibility.canLaunch || walletSession.authMethod !== 'siwe') {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error:
          railCompatibility.message ??
          'Sign in with an Ethereum wallet to launch.',
      });
      return;
    }

    if (tx.phase === 'lock_required') {
      await resumeLock();
      return;
    }
    if (isLaunchCompletionActive(tx.phase)) {
      return;
    }

    if (!connectedAddress) {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error: 'Connect a wallet to launch.',
      });
      return;
    }

    if (schemaReady !== true) {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error: PONS_SCHEMA_BLOCKED_MESSAGE,
      });
      return;
    }

    let effectiveChainId = accountChainId;
    if (accountChainId != null && accountChainId !== ROBINHOOD_CHAIN_ID) {
      try {
        await switchChainAsync?.({ chainId: ROBINHOOD_CHAIN_ID });
        effectiveChainId = ROBINHOOD_CHAIN_ID;
      } catch {
        setTx({
          ...INITIAL_LAUNCH_TX_STATE,
          phase: 'failed',
          error: 'Switch to Robinhood Chain (4663) to launch.',
        });
        return;
      }
    }

    if (!publicClient || !walletClient) {
      setTx({
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'failed',
        error: 'Wallet client not ready. Reconnect and try again.',
      });
      return;
    }

    const draftId =
      ponsDraftIdRef.current ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `pons-${crypto.randomUUID()}`
        : `pons-${Date.now()}`);
    ponsDraftIdRef.current = draftId;
    setPonsDraftId(draftId);

    launchInFlight.current = true;
    setTx({ ...INITIAL_LAUNCH_TX_STATE, phase: 'preparing_artwork' });
    try {
      await runPublicPonsLaunch({
        state,
        draftId,
        liveAddress: connectedAddress,
        liveChainId: effectiveChainId,
        publicClient,
        walletClient,
        schemaReady: true,
        getLiveAccount: () => ({
          address: accountRef.current.address,
          chainId: accountRef.current.chainId,
        }),
        callbacks: {
          onPhase: (partial) => {
            setTx((prev) => ({ ...prev, ...partial }));
          },
          onImagePinned: (image) => {
            dispatch({ type: 'SET_IMAGE', image });
          },
          onPendingState: (pending) => {
            ponsDraftIdRef.current = pending.draftId;
            setPonsDraftId(pending.draftId);
          },
        },
      });
    } finally {
      launchInFlight.current = false;
    }
  }

  async function resumeLock() {
    if (launchInFlight.current || isLaunchTxBusy(tx.phase)) return;
    const draftId = ponsDraftIdRef.current ?? ponsDraftId;
    if (!draftId || !publicClient || !walletClient) return;
    launchInFlight.current = true;
    try {
      await resumePublicPonsLaunch({
        draftId,
        publicClient,
        walletClient,
        getLiveAccount: () => ({
          address: accountRef.current.address,
          chainId: accountRef.current.chainId,
        }),
        callbacks: {
          onPhase: (partial) => {
            setTx((prev) => ({ ...prev, ...partial }));
          },
          onImagePinned: (image) => {
            dispatch({ type: 'SET_IMAGE', image });
          },
        },
        state,
      });
    } finally {
      launchInFlight.current = false;
    }
  }

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <header className="mb-5 md:mb-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Launch something new</h1>
        <p className="mt-1.5 max-w-xl text-sm text-[var(--muted)] md:text-base">
          {pumpRail
            ? 'Create a coin on Pump.fun (Solana). No initial buy in this release.'
            : isBurnDevSupplyPolicy(state.devSupplyPolicy)
              ? 'Create a Pons token with an ETH dev buy. Your full dev allocation is burned after launch.'
              : state.devSupplyPolicy === 'lock_6m'
                ? 'Create a Pons token with an ETH dev buy. Your allocation locks for 6 months via HoodLock.'
                : `Create a Pons token with an ETH dev buy. ${devSupplyOption(state.devSupplyPolicy).helper}`}
        </p>
      </header>

      <div className="mb-5 md:mb-6">
        <LaunchRailSelector
          value={state.launchRail}
          onChange={onLaunchRailChange}
          disabled={
            isLaunchTxBusy(tx.phase) ||
            isLaunchCompletionActive(tx.phase) ||
            Boolean(pumpResult) ||
            Boolean(pumpSignatureRef.current)
          }
        />
      </div>

      {quoteWarning && !pumpRail ? (
        <p
          className="mb-4 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--muted)]"
          role="status"
          data-testid="assist-quote-warning"
        >
          {quoteWarning}
        </p>
      ) : null}

      <LaunchProgress step={state.step} launchRail={state.launchRail} />

      {!railCompatibility.canLaunch && (state.step === 3 || !pumpRail) ? (
        <div
          className="mb-4 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--muted)]"
          role="status"
          data-testid="launch-rail-compatibility"
        >
          <p>{railCompatibility.message}</p>
        </div>
      ) : null}

      {artworkNotice && state.step !== 1 ? (
        <ArtworkFlowNotice
          notice={artworkNotice}
          onViewImage={viewImageFromNotice}
          onDismiss={() => setArtworkNotice(null)}
        />
      ) : null}

      {state.step === 1 ? (
        <TokenStep
          state={state}
          errors={visibleErrors}
          provenance={provenance}
          onPatch={(patch) => dispatch({ type: 'PATCH', patch })}
          onTicker={(ticker) => dispatch({ type: 'SET_TICKER', ticker })}
          onImage={(image) => dispatch({ type: 'SET_IMAGE', image })}
          onClearImage={() => dispatch({ type: 'CLEAR_IMAGE' })}
          onRetryArtwork={() => void startArtworkJob('retry')}
          onGenerateAnother={() => void startArtworkJob('regenerate')}
          generateAnotherDisabled={artworkJobBusy || state.image.artworkStatus === 'regenerating'}
        />
      ) : null}

      {state.step === 2 ? (
        pumpRail ? (
          <PumpRouteStep
            errors={visibleErrors}
            compatibility={railCompatibility}
            solanaAddress={
              walletSession.namespace === 'solana' ? walletSession.address : null
            }
          />
        ) : (
          <DevBuyStep
            state={state}
            errors={visibleErrors}
            policyLocked={Boolean(tx.txHash) || isLaunchCompletionActive(tx.phase)}
            onPatch={(patch) => dispatch({ type: 'PATCH', patch })}
          />
        )
      ) : null}

      {state.step === 3 ? (
        <ReviewStep
          state={state}
          connectedAddress={connectedAddress}
          solanaAddress={solanaAddress}
          tx={tx}
          schemaBlocked={!pumpRail && schemaReady === false}
          pumpResult={pumpResult}
          pumpPersistError={pumpPersistError}
          onRetryPumpPersist={() => {
            void retryPumpPersist();
          }}
          onRetryIndex={retryIndexCheck}
          onRetryNews={() => {
            void retryNewsLink();
          }}
          onViewMarket={viewMarket}
          onResumeLock={() => {
            void resumeLock();
          }}
        />
      ) : null}

      <LaunchNav
        onBack={
          state.step > 1 &&
          !isLaunchTxBusy(tx.phase) &&
          !isLaunchCompletionActive(tx.phase) &&
          !pumpResult
            ? goBack
            : undefined
        }
        onContinue={
          state.step < 3
            ? goContinue
            : pumpRail
              ? () => {
                  if (pumpResult) return;
                  void submitLaunch();
                }
              : canShowViewMarket(
                    tx.phase,
                    tx.indexedLaunch?.tokenAddress || tx.decoded?.token
                      ? tokenMarketPath(tx.indexedLaunch?.tokenAddress ?? tx.decoded!.token)
                      : null,
                  )
                ? viewMarket
                : tx.phase === 'lock_required'
                  ? () => {
                      void resumeLock();
                    }
                  : () => {
                      void submitLaunch();
                    }
        }
        continueLabel={
          state.step === 2
            ? 'Review →'
            : state.step === 3
              ? pumpRail
                ? pumpResult && !pumpPersistError
                  ? 'Opening market…'
                  : pumpPersistError
                    ? 'Retry save →'
                    : isLaunchTxBusy(tx.phase)
                      ? launchTxBusyReason(tx.phase, state.devSupplyPolicy, true)
                      : 'Launch on Pump.fun →'
                : canShowViewMarket(
                      tx.phase,
                      tx.indexedLaunch?.tokenAddress || tx.decoded?.token
                        ? tokenMarketPath(tx.indexedLaunch?.tokenAddress ?? tx.decoded!.token)
                        : null,
                    )
                  ? 'View token →'
                  : tx.phase === 'lock_required'
                    ? isBurnDevSupplyPolicy(state.devSupplyPolicy)
                      ? 'Resume burn →'
                      : 'Resume locking →'
                    : isLaunchCompletionActive(tx.phase) || isLaunchTxBusy(tx.phase)
                      ? isLaunchTxBusy(tx.phase)
                        ? launchTxBusyReason(tx.phase, state.devSupplyPolicy, false)
                        : 'Confirmed'
                      : 'Launch token →'
              : 'Continue →'
        }
        continueDisabled={
          state.step === 3 &&
          (pumpRail
            ? Boolean(launchDisabledReason) ||
              (Boolean(pumpResult) && !pumpPersistError) ||
              isLaunchTxBusy(tx.phase)
            : tx.phase !== 'lock_required' &&
              (Boolean(launchDisabledReason) ||
                (!canShowViewMarket(
                  tx.phase,
                  tx.indexedLaunch?.tokenAddress || tx.decoded?.token
                    ? tokenMarketPath(tx.indexedLaunch?.tokenAddress ?? tx.decoded!.token)
                    : null,
                ) &&
                  (isLaunchTxBusy(tx.phase) || isLaunchCompletionActive(tx.phase)))))
        }
        continueDisabledReason={
          pumpRail || tx.phase === 'lock_required' ? (pumpRail ? launchDisabledReason : undefined) : launchDisabledReason
        }
      />
    </div>
  );
}

function launchTxBusyReason(
  phase: LaunchTxState['phase'],
  policy: ReturnType<typeof resolveDevSupplyPolicy> = 'lock_6m',
  pump = false,
): string {
  if (pump) {
    switch (phase) {
      case 'preparing_artwork':
        return 'Preparing metadata…';
      case 'simulating':
        return 'Building Pump.fun transaction…';
      case 'awaiting_wallet':
        return 'Confirm in wallet…';
      case 'submitted':
        return 'Broadcasting to Solana…';
      case 'confirming':
        return 'Confirming launch…';
      default:
        return 'Launch in progress…';
    }
  }
  const burn = isBurnDevSupplyPolicy(policy);
  switch (phase) {
    case 'preparing_artwork':
      return 'Preparing artwork…';
    case 'simulating':
      return 'Simulating Pons launch…';
    case 'awaiting_wallet':
      return 'Confirm launch in your wallet…';
    case 'submitted':
    case 'confirming':
      return 'Confirming launch…';
    case 'lock_preparing':
      return policy === 'lock_6m' ? 'Preparing 6-month lock…' : 'Preparing lock…';
    case 'approving_lock':
      return 'Approve lock in your wallet…';
    case 'awaiting_lock_wallet':
    case 'locking_dev_tokens':
      return 'Locking dev tokens…';
    case 'verifying_lock':
      return 'Verifying lock…';
    case 'burning_dev_tokens':
      return 'Burning dev supply';
    case 'verifying_burn':
      return 'Verifying burn';
    case 'waiting_for_indexer':
      return 'Market data is appearing now.';
    case 'activating_news':
      return 'Linking News article…';
    default:
      return burn ? 'Burn in progress…' : 'Launch in progress…';
  }
}

export function LaunchFlowLive({ catalogue }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[680px] py-10 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Loading launch…
        </div>
      }
    >
      <LaunchFlowInner catalogue={catalogue} />
    </Suspense>
  );
}
