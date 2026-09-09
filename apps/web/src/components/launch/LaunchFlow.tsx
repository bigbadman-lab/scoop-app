'use client';

import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  createInitialLaunchState,
  type FieldErrors,
  type LaunchFormState,
  type LaunchStepId,
} from '@/lib/launch/types';
import { launchReducer } from '@/lib/launch/state';
import {
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
      sourceDraftId: handoff.draftId,
      image: {
        previewUrl: handoff.image.previewUrl,
        fileName: handoff.image.fileName,
        mimeType: handoff.image.mimeType,
        byteSize: handoff.image.byteSize,
        persistence: 'local_only',
      },
    },
  };
}

function LaunchFlowInner({ catalogue }: Props) {
  const searchParams = useSearchParams();
  const assist = searchParams.get('assist') === '1';
  const applied = useRef(false);

  const [state, dispatch] = useReducer(launchReducer, undefined, () =>
    createInitialLaunchState(),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [provenance, setProvenance] = useState<LaunchAssistArticle | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);

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

  const stepErrors = useMemo(() => {
    if (!attempted) return {} as FieldErrors;
    if (state.step === 1) return validateTokenStep(state);
    if (state.step === 2) return validateMarketStep(state);
    if (state.step === 3) return validateEarningsStep(state);
    return {};
  }, [attempted, state]);

  const visibleErrors = attempted ? { ...errors, ...stepErrors } : errors;

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

      {state.step === 1 ? (
        <TokenStep
          state={state}
          errors={visibleErrors}
          provenance={provenance}
          onPatch={(patch) => dispatch({ type: 'PATCH', patch })}
          onTicker={(ticker) => dispatch({ type: 'SET_TICKER', ticker })}
          onImage={(image) => dispatch({ type: 'SET_IMAGE', image })}
          onClearImage={() => dispatch({ type: 'CLEAR_IMAGE' })}
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
        continueDisabledReason={
          state.step === 4
            ? 'Wallet write infrastructure is not available — launch cannot be submitted.'
            : undefined
        }
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
