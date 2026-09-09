'use client';

import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  isArtworkBlockingLaunch,
  validateEarningsStep,
  validateMarketStep,
  validateTokenStep,
} from '@/lib/launch/validation';
import { consumeAssistedLaunchHandoff } from '@/lib/launch-assist/handoff';
import type { LaunchAssistArticle } from '@/lib/launch-assist/types';
import { LaunchProgress } from '@/components/launch/LaunchProgress';
import { LaunchNav } from '@/components/launch/LaunchNav';
import { TokenStep } from '@/components/launch/steps/TokenStep';
import { MarketStep } from '@/components/launch/steps/MarketStep';
import { EarningsStep } from '@/components/launch/steps/EarningsStep';
import { ReviewStep } from '@/components/launch/steps/ReviewStep';

type Props = {
  catalogue: PublicQuoteCatalogueItem[];
};

type ArtworkNotice =
  | { kind: 'ready' }
  | { kind: 'regenerated' }
  | { kind: 'failed' };

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

function applyAssistedPrefill(
  catalogue: readonly PublicQuoteCatalogueItem[],
): {
  prefill: Partial<LaunchFormState> | null;
  provenance: LaunchAssistArticle | null;
  quoteWarning: string | null;
} {
  const handoff = consumeAssistedLaunchHandoff();
  if (!handoff) {
    return { prefill: null, provenance: null, quoteWarning: null };
  }

  const address = handoff.quoteAsset.trim().toLowerCase();
  const match = catalogue.find((q) => q.quoteAsset.toLowerCase() === address) ?? null;

  let quoteWarning: string | null = null;
  let quoteAsset: string | null = null;
  let quoteSymbol: string | null = null;
  if (match) {
    quoteAsset = match.quoteAsset;
    quoteSymbol = match.displaySymbol || match.symbol;
  } else if (address) {
    quoteWarning =
      'The recommended quote is no longer enabled. Choose a market pair to continue.';
  }

  return {
    provenance: handoff.article,
    quoteWarning,
    prefill: {
      name: handoff.concept.name,
      ticker: handoff.concept.ticker.trim().toUpperCase().replace(/^\$/, ''),
      description: handoff.concept.description,
      quoteAsset,
      quoteSymbol,
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
          className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--scoop-orange)] underline-offset-4 hover:underline"
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
  const searchParams = useSearchParams();
  const assist = searchParams.get('assist') === '1';
  const applied = useRef(false);
  /** Box avoids TS narrowing the ref from the poll effect's `source !== 'user'` guard. */
  const imageSourceRef = useRef<{ source: TokenImageState['source'] }>({
    source: 'none',
  });
  const stepRef = useRef<LaunchStepId>(1);
  const regeneratingRef = useRef(false);
  const previousReadyRef = useRef<TokenImageState | null>(null);

  const [state, dispatch] = useReducer(launchReducer, undefined, () =>
    createInitialLaunchState(),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [provenance, setProvenance] = useState<LaunchAssistArticle | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [artworkNotice, setArtworkNotice] = useState<ArtworkNotice | null>(null);
  const [artworkJobBusy, setArtworkJobBusy] = useState(false);

  imageSourceRef.current.source = state.image.source;
  stepRef.current = state.step;
  regeneratingRef.current = state.image.artworkStatus === 'regenerating';

  useEffect(() => {
    if (!assist || applied.current) return;
    applied.current = true;
    const { prefill, provenance: story, quoteWarning: warning } =
      applyAssistedPrefill(catalogue);
    if (!prefill) return;
    dispatch({ type: 'PATCH', patch: prefill });
    setProvenance(story);
    setQuoteWarning(warning);
  }, [assist, catalogue]);

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
    const startedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

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
        };
        if (cancelled) return;
        if (imageSourceRef.current.source === 'user') return;

        if (data.artworkStatus === 'ready' && data.previewUrl) {
          const wasRegen = regeneratingRef.current;
          console.info(
            JSON.stringify({
              event: 'launch_assist_artwork_ready',
              ms: Math.round(
                (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
                  startedAt,
              ),
              draftId: pollDraftId,
              regenerated: wasRegen,
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
    if (state.step === 2) return validateMarketStep(state);
    if (state.step === 3) return validateEarningsStep(state);
    return {};
  }, [attempted, state]);

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
      const next = validateMarketStep(state);
      setErrors(next);
      if (Object.keys(next).length) return;
      dispatch({ type: 'SET_STEP', step: 3 });
      setAttempted(false);
      return;
    }
    if (state.step === 3) {
      const next = validateEarningsStep(state);
      setErrors(next);
      if (Object.keys(next).length) return;
      dispatch({ type: 'SET_STEP', step: 4 });
      setAttempted(false);
    }
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
    state.step === 4
      ? artworkBlockingLaunch
        ? 'Finishing your token image…'
        : 'Wallet write infrastructure is not available — launch cannot be submitted.'
      : undefined;

  return (
    <div className="mx-auto w-full max-w-[680px]">
      <header className="mb-5 md:mb-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Launch something new
        </h1>
        <p className="mt-1.5 max-w-xl text-sm text-[var(--muted)] md:text-base">
          Turn the news into a market, choose what it trades against, and earn from
          every trade.
        </p>
      </header>

      <LaunchProgress step={state.step} />

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
          generateAnotherDisabled={
            artworkJobBusy || state.image.artworkStatus === 'regenerating'
          }
        />
      ) : null}

      {state.step === 2 ? (
        <MarketStep
          state={state}
          errors={visibleErrors}
          catalogue={catalogue}
          quoteWarning={quoteWarning}
          onSelect={(quoteAsset, quoteSymbol) => {
            setQuoteWarning(null);
            dispatch({ type: 'SELECT_QUOTE', quoteAsset, quoteSymbol });
          }}
        />
      ) : null}

      {state.step === 3 ? (
        <EarningsStep
          state={state}
          errors={visibleErrors}
          onMode={(mode) => dispatch({ type: 'SET_CREATOR_MODE', mode })}
          onPatch={(patch) => dispatch({ type: 'PATCH', patch })}
        />
      ) : null}

      {state.step === 4 ? <ReviewStep state={state} catalogue={catalogue} /> : null}

      <LaunchNav
        onBack={state.step > 1 ? goBack : undefined}
        onContinue={
          state.step < 4
            ? goContinue
            : () => {
                /* intentionally no-op — writes deferred */
              }
        }
        continueLabel={
          state.step === 3 ? 'Review →' : state.step === 4 ? 'Launch token →' : 'Continue →'
        }
        continueDisabled={state.step === 4}
        continueDisabledReason={launchDisabledReason}
      />
    </div>
  );
}

export function LaunchFlow({ catalogue }: Props) {
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
