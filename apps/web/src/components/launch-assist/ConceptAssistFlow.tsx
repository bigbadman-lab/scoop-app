'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { AuthInterrupt } from '@/components/auth/AuthInterrupt';
import { AssistAuthGate } from '@/components/auth/AssistAuthGate';
import {
  saveAssistedLaunchHandoff,
  saveSelectedLaunchConcept,
} from '@/lib/launch-assist/handoff';
import { ASSISTED_LAUNCH_MARKER } from '@/lib/launch-assist/types';
import type {
  LaunchAssistArticle,
  PublicLaunchConcept,
} from '@/lib/launch-assist/types';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';

type Props = {
  providerArticleId: string;
  catalogue: PublicQuoteCatalogueItem[];
};

type ViewState =
  | { kind: 'loading_concepts' }
  | { kind: 'concepts'; article: LaunchAssistArticle; concepts: PublicLaunchConcept[] }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'error'; message: string; retryable: boolean }
  | {
      kind: 'start_error';
      article: LaunchAssistArticle;
      concepts: PublicLaunchConcept[];
      message: string;
      rateLimited?: boolean;
    };

const LOADING_STAGES = [
  'Reading the story…',
  'Finding the market angle…',
  'Generating token ideas…',
] as const;

function resolveQuote(
  catalogue: readonly PublicQuoteCatalogueItem[],
  address: string,
): PublicQuoteCatalogueItem | null {
  const needle = address.toLowerCase();
  return catalogue.find((q) => q.quoteAsset.toLowerCase() === needle) ?? null;
}

function StagedConceptLoading() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => Math.min(s + 1, LOADING_STAGES.length - 1));
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--scoop-orange)]">
        Making a market
      </p>
      <p className="mt-3 max-w-sm text-sm text-[var(--muted)] motion-safe:animate-pulse motion-reduce:animate-none">
        {LOADING_STAGES[stage]}
      </p>
    </div>
  );
}

export function ConceptAssistFlow({ providerArticleId, catalogue }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: 'loading_concepts' });
  const [authReady, setAuthReady] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const startedRef = useRef(false);
  const artworkStartGuard = useRef(false);

  async function generateConcepts() {
    setState({ kind: 'loading_concepts' });
    const t0 =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const res = await fetch('/api/launch-assist/concepts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        article?: LaunchAssistArticle;
        concepts?: PublicLaunchConcept[];
      };

      if (res.status === 429) {
        setState({
          kind: 'rate_limited',
          message:
            data.error ??
            "You've reached the current generation limit. Try again shortly.",
        });
        return;
      }
      if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
        setState({
          kind: 'auth',
          message:
            data.error ??
            'Sign in with your wallet to use launch assist.',
        });
        return;
      }
      if (!res.ok || !data.article || !data.concepts || data.concepts.length !== 3) {
        setState({
          kind: 'error',
          message: data.error ?? 'Could not generate launch concepts for this story.',
          retryable: res.status !== 400 || data.code === 'CONCEPT_FAILED',
        });
        return;
      }
      console.info(
        JSON.stringify({
          event: 'launch_assist_concepts_ready',
          ms: Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0,
          ),
          providerArticleId,
        }),
      );
      setState({ kind: 'concepts', article: data.article, concepts: data.concepts });
    } catch {
      setState({
        kind: 'error',
        message: 'Could not generate launch concepts for this story.',
        retryable: true,
      });
    }
  }

  useEffect(() => {
    startedRef.current = false;
    setAuthReady(false);
    artworkStartGuard.current = false;
    setSelectingId(null);
  }, [providerArticleId]);

  useEffect(() => {
    if (!authReady || startedRef.current) return;
    startedRef.current = true;
    void generateConcepts();
    // Intentionally once per authReady + article id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, providerArticleId]);

  async function handleUseThisIdea(
    concept: PublicLaunchConcept,
    article: LaunchAssistArticle,
    concepts: PublicLaunchConcept[],
  ) {
    if (!concept.pairEnabled || artworkStartGuard.current) return;
    artworkStartGuard.current = true;
    setSelectingId(concept.id);

    const clickAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    saveSelectedLaunchConcept({
      providerArticleId,
      article,
      concept,
      selectedAt: new Date().toISOString(),
    });

    try {
      const res = await fetch('/api/launch-assist/artwork/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId, concept }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        draftId?: string;
      };

      if (res.status === 429) {
        artworkStartGuard.current = false;
        setSelectingId(null);
        setState({
          kind: 'start_error',
          article,
          concepts,
          rateLimited: true,
          message:
            data.error ??
            "You've reached the current generation limit. Try again shortly.",
        });
        return;
      }
      if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
        artworkStartGuard.current = false;
        setSelectingId(null);
        setState({
          kind: 'auth',
          message:
            data.error ??
            'Sign in with your wallet to use launch assist.',
        });
        return;
      }
      if (!res.ok || !data.draftId) {
        artworkStartGuard.current = false;
        setSelectingId(null);
        setState({
          kind: 'start_error',
          article,
          concepts,
          message: data.error ?? 'Could not start artwork for this idea.',
        });
        return;
      }

      saveAssistedLaunchHandoff({
        marker: ASSISTED_LAUNCH_MARKER,
        providerArticleId,
        article,
        concept,
        draftId: data.draftId,
        quoteAsset: concept.recommendedPairAddress,
        quoteSymbol: concept.recommendedPairSymbol,
        image: {
          source: 'pending',
          previewUrl: null,
          fileName: null,
          mimeType: null,
          byteSize: null,
          draftId: data.draftId,
        },
        createdAt: new Date().toISOString(),
      });

      console.info(
        JSON.stringify({
          event: 'launch_assist_use_idea_nav',
          ms: Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
              clickAt,
          ),
          draftId: data.draftId,
          providerArticleId,
        }),
      );

      router.push('/launch?assist=1');
    } catch {
      artworkStartGuard.current = false;
      setSelectingId(null);
      setState({
        kind: 'start_error',
        article,
        concepts,
        message: 'Could not start artwork for this idea.',
      });
    }
  }

  const resumePath = `/news/${encodeURIComponent(providerArticleId)}/launch`;
  const markAuthReady = useCallback(() => {
    setAuthReady(true);
  }, []);
  const blockAuth = useCallback(() => {
    setAuthReady(false);
    startedRef.current = false;
  }, []);
  const cancelAuth = useCallback(() => {
    router.back();
  }, [router]);

  const gate = (
    <AssistAuthGate
      resumePath={resumePath}
      visible={!authReady}
      onReady={markAuthReady}
      onCancel={cancelAuth}
      onBlocked={blockAuth}
    />
  );

  if (!authReady) {
    return gate;
  }

  let body: ReactNode = null;

  if (state.kind === 'loading_concepts') {
    body = <StagedConceptLoading />;
  }

  if (state.kind === 'rate_limited' || state.kind === 'auth' || state.kind === 'error') {
    if (state.kind === 'auth') {
      body = (
        <AuthInterrupt
          resumePath={resumePath}
          onAuthenticated={() => void generateConcepts()}
          onCancel={() => router.back()}
        />
      );
    } else {
      body = (
        <div className="mx-auto max-w-xl space-y-5 px-4 py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Launch assist
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {state.kind === 'rate_limited' ? 'Limit reached' : 'Could not make a market'}
          </h1>
          <p className="text-sm text-[var(--muted)]">{state.message}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {state.kind === 'error' && state.retryable ? (
              <button
                type="button"
                onClick={() => void generateConcepts()}
                className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
              >
                Try again
              </button>
            ) : null}
            <Link
              href="/launch"
              className="inline-flex min-h-10 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
            >
              Create manually →
            </Link>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex min-h-10 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
            >
              ← Back
            </button>
          </div>
        </div>
      );
    }
  }

  if (state.kind === 'start_error') {
    body = (
      <div className="mx-auto max-w-xl space-y-5 px-4 py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Launch assist
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state.rateLimited ? 'Limit reached' : 'Could not start launch'}
        </h1>
        <p className="text-sm text-[var(--muted)]">{state.message}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {!state.rateLimited ? (
            <button
              type="button"
              onClick={() =>
                setState({
                  kind: 'concepts',
                  article: state.article,
                  concepts: state.concepts,
                })
              }
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
            >
              Back to ideas
            </button>
          ) : null}
          <Link
            href="/launch"
            className="inline-flex min-h-10 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
          >
            Create manually →
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === 'concepts') {
    const { article, concepts } = state;
    body = (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        <div className="border-b border-[var(--divider)] pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]">
            From the news
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
            {article.headline}
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {article.sourceDomain}
            <span className="text-[var(--muted-2)]"> · </span>
            <NewsAge iso={article.publishedAt} />
            {article.url ? (
              <>
                <span className="text-[var(--muted-2)]"> · </span>
                <CtaLink href={article.url} external>
                  Read ↗
                </CtaLink>
              </>
            ) : null}
          </p>
        </div>

        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Choose a token idea
        </p>

        <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-3">
          {concepts.map((concept) => {
            const quote = resolveQuote(catalogue, concept.recommendedPairAddress);
            const disabled = !concept.pairEnabled || selectingId !== null;
            const busy = selectingId === concept.id;
            return (
              <li key={concept.id}>
                <article
                  className={[
                    'flex h-full flex-col rounded-[var(--radius-md)] border border-[var(--divider)] p-3.5',
                    !concept.pairEnabled ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-semibold leading-snug tracking-tight">
                      {concept.name}
                    </h2>
                    <p className="shrink-0 font-mono text-[12px] tracking-wide text-[var(--muted)]">
                      ${concept.ticker}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-2 flex-1 text-[13px] leading-snug text-[var(--muted)]">
                    {concept.description}
                  </p>

                  <div className="mt-3 flex items-center gap-2">
                    {quote?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={quote.imageUrl}
                        alt=""
                        width={22}
                        height={22}
                        className="h-[22px] w-[22px] rounded-[var(--radius-sm)] object-cover"
                      />
                    ) : (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--scoop-orange)] font-mono text-[8px] text-[var(--scoop-orange-contrast)]">
                        {(quote?.displaySymbol ?? concept.recommendedPairSymbol).slice(0, 3)}
                      </span>
                    )}
                    <p className="font-mono text-[11px] text-[var(--fg)]">
                      Pair · {quote?.displaySymbol ?? concept.recommendedPairSymbol}
                    </p>
                  </div>
                  {!concept.pairEnabled ? (
                    <p className="mt-2 font-mono text-[10px] text-[#b42318]" role="status">
                      Pair unavailable
                    </p>
                  ) : null}

                  <button
                    type="button"
                    disabled={disabled}
                    aria-busy={busy}
                    onClick={() => void handleUseThisIdea(concept, article, concepts)}
                    className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? 'Opening…' : 'Use this idea'}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-[var(--divider)] pt-4">
          <Link
            href="/launch"
            className="inline-flex min-h-9 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            Create manually →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {gate}
      {body}
    </>
  );
}
