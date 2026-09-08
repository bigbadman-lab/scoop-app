'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { ArtworkChooser } from '@/components/launch-assist/ArtworkChooser';
import { AuthInterrupt } from '@/components/auth/AuthInterrupt';
import { AssistAuthGate } from '@/components/auth/AssistAuthGate';
import {
  saveAssistedLaunchHandoff,
  saveSelectedLaunchConcept,
} from '@/lib/launch-assist/handoff';
import { ASSISTED_LAUNCH_MARKER } from '@/lib/launch-assist/types';
import type {
  LaunchAssistArticle,
  PublicArtworkOption,
  PublicLaunchConcept,
  SelectedTokenImage,
} from '@/lib/launch-assist/types';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import { validateImageFile } from '@/lib/launch/validation';

type Props = {
  providerArticleId: string;
  catalogue: PublicQuoteCatalogueItem[];
};

type ViewState =
  | { kind: 'loading_concepts' }
  | { kind: 'concepts'; article: LaunchAssistArticle; concepts: PublicLaunchConcept[] }
  | { kind: 'creating_images'; article: LaunchAssistArticle; concept: PublicLaunchConcept }
  | {
      kind: 'images';
      article: LaunchAssistArticle;
      concept: PublicLaunchConcept;
      draftId: string;
      images: PublicArtworkOption[];
    }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'error'; message: string; retryable: boolean; retry: 'concepts' | 'images' }
  | {
      kind: 'image_error';
      article: LaunchAssistArticle;
      concept: PublicLaunchConcept;
      message: string;
      rateLimited?: boolean;
    };

function resolveQuote(
  catalogue: readonly PublicQuoteCatalogueItem[],
  address: string,
): PublicQuoteCatalogueItem | null {
  const needle = address.toLowerCase();
  return catalogue.find((q) => q.quoteAsset.toLowerCase() === needle) ?? null;
}

function ImageErrorFallback({
  article,
  concept,
  message,
  rateLimited,
  onRetry,
  onBackToIdeas,
  onUploadContinue,
}: {
  article: LaunchAssistArticle;
  concept: PublicLaunchConcept;
  message: string;
  rateLimited?: boolean;
  onRetry: () => void;
  onBackToIdeas: () => void;
  onUploadContinue: (image: SelectedTokenImage) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Launch assist
      </p>
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        {rateLimited ? 'Limit reached' : 'Could not create images'}
      </h1>
      <p className="text-sm text-[var(--muted)]">{message}</p>
      <p className="text-sm text-[var(--muted)]">
        {concept.name} · ${concept.ticker}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {!rateLimited ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
          >
            Try again
          </button>
        ) : null}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const validation = validateImageFile(file);
            if (validation) {
              setUploadError(validation);
              return;
            }
            setUploadError(null);
            onUploadContinue({
              source: 'upload',
              previewUrl: URL.createObjectURL(file),
              fileName: file.name,
              mimeType: file.type,
              byteSize: file.size,
            });
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em]"
        >
          Upload your own
        </button>
        <Link
          href="/launch"
          className="inline-flex min-h-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Continue manually →
        </Link>
        <button
          type="button"
          onClick={onBackToIdeas}
          className="inline-flex min-h-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          ← Back to ideas
        </button>
      </div>
      {uploadError ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          {uploadError}
        </p>
      ) : null}
      <p className="sr-only">{article.headline}</p>
    </div>
  );
}

export function ConceptAssistFlow({ providerArticleId, catalogue }: Props) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: 'loading_concepts' });
  const [authReady, setAuthReady] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const artworkInFlight = useRef(false);
  const lastConcepts = useRef<PublicLaunchConcept[] | null>(null);
  const startedRef = useRef(false);

  async function generateConcepts() {
    setState({ kind: 'loading_concepts' });
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
          retry: 'concepts',
        });
        return;
      }
      setState({ kind: 'concepts', article: data.article, concepts: data.concepts });
      lastConcepts.current = data.concepts;
    } catch {
      setState({
        kind: 'error',
        message: 'Could not generate launch concepts for this story.',
        retryable: true,
        retry: 'concepts',
      });
    }
  }

  async function generateImages(
    article: LaunchAssistArticle,
    concept: PublicLaunchConcept,
  ) {
    if (artworkInFlight.current) return;
    artworkInFlight.current = true;
    setState({ kind: 'creating_images', article, concept });
    try {
      const res = await fetch('/api/launch-assist/artwork', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId, concept }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        draftId?: string;
        images?: PublicArtworkOption[];
      };

      if (res.status === 429) {
        setState({
          kind: 'image_error',
          article,
          concept,
          rateLimited: true,
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
      if (!res.ok || !data.draftId || !data.images || data.images.length !== 3) {
        setState({
          kind: 'image_error',
          article,
          concept,
          message: data.error ?? 'Could not create token images for this idea.',
        });
        return;
      }
      setState({
        kind: 'images',
        article,
        concept,
        draftId: data.draftId,
        images: data.images,
      });
    } catch {
      setState({
        kind: 'image_error',
        article,
        concept,
        message: 'Could not create token images for this idea.',
      });
    } finally {
      artworkInFlight.current = false;
    }
  }

  useEffect(() => {
    startedRef.current = false;
    setAuthReady(false);
  }, [providerArticleId]);

  useEffect(() => {
    if (!authReady || startedRef.current) return;
    startedRef.current = true;
    void generateConcepts();
    // Intentionally once per authReady + article id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, providerArticleId]);

  function selectConcept(concept: PublicLaunchConcept, article: LaunchAssistArticle) {
    if (!concept.pairEnabled || artworkInFlight.current) return;
    saveSelectedLaunchConcept({
      providerArticleId,
      article,
      concept,
      selectedAt: new Date().toISOString(),
    });
    void generateImages(article, concept);
  }

  async function continueToLaunch(
    article: LaunchAssistArticle,
    concept: PublicLaunchConcept,
    draftId: string | null,
    image: SelectedTokenImage,
  ) {
    setContinuing(true);
    if (image.source === 'generated') {
      try {
        await fetch('/api/launch-assist/artwork/select', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draftId: image.draftId,
            artworkId: image.artworkAssetId,
          }),
        });
      } catch {
        // Prefill still works from session image URL even if select fails.
      }
    }

    saveAssistedLaunchHandoff({
      marker: ASSISTED_LAUNCH_MARKER,
      providerArticleId,
      article,
      concept,
      draftId,
      quoteAsset: concept.recommendedPairAddress,
      quoteSymbol: concept.recommendedPairSymbol,
      image,
      createdAt: new Date().toISOString(),
    });
    router.push('/launch?assist=1');
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
    body = (
      <div
        className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--scoop-orange)]">
          Making a market
        </p>
        <p className="mt-3 max-w-sm text-sm text-[var(--muted)] motion-safe:animate-pulse motion-reduce:animate-none">
          Reading the story. Finding the angle.
        </p>
      </div>
    );
  }

  if (state.kind === 'creating_images') {
    body = (
      <div
        className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-4 py-16 text-center"
        role="status"
        aria-live="polite"
      >
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--scoop-orange)]">
          Creating your token
        </p>
        <p className="mt-3 max-w-sm text-sm text-[var(--muted)] motion-safe:animate-pulse motion-reduce:animate-none">
          Creating three visual directions for your idea.
        </p>
        <p className="mt-8 max-w-md text-sm text-[var(--muted)]">
          <span className="font-semibold text-[var(--fg)]">{state.concept.name}</span>
          <span className="font-mono text-[var(--muted-2)]"> · ${state.concept.ticker}</span>
        </p>
        <p className="mt-2 line-clamp-2 max-w-md text-sm text-[var(--muted-2)]">
          {state.article.headline}
        </p>
      </div>
    );
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
      <div className="mx-auto max-w-xl space-y-6 px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
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
              className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
            >
              Try again
            </button>
          ) : null}
          <Link
            href="/launch"
            className="inline-flex min-h-11 items-center justify-center border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
          >
            Create manually →
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            ← Back
          </button>
        </div>
      </div>
    );
    }
  }

  if (state.kind === 'image_error') {
    body = (
      <ImageErrorFallback
        article={state.article}
        concept={state.concept}
        message={state.message}
        rateLimited={state.rateLimited}
        onRetry={() => void generateImages(state.article, state.concept)}
        onBackToIdeas={() => {
          const concepts = lastConcepts.current;
          if (concepts && concepts.length === 3) {
            setState({
              kind: 'concepts',
              article: state.article,
              concepts,
            });
            return;
          }
          void generateConcepts();
        }}
        onUploadContinue={(image) =>
          void continueToLaunch(state.article, state.concept, null, image)
        }
      />
    );
  }

  if (state.kind === 'images') {
    body = (
      <ArtworkChooser
        article={state.article}
        concept={state.concept}
        draftId={state.draftId}
        images={state.images}
        continuing={continuing}
        onContinue={(image) =>
          void continueToLaunch(state.article, state.concept, state.draftId, image)
        }
      />
    );
  }

  if (state.kind === 'concepts') {
    const { article, concepts } = state;
    body = (
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Launch the story
        </p>

        <div className="mt-4 space-y-2 border-b border-[var(--divider)] pb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]">
            From the news
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {article.headline}
          </h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {article.sourceDomain}
            <span className="text-[var(--muted-2)]"> · </span>
            <NewsAge iso={article.publishedAt} />
          </p>
          {article.url ? (
            <div className="pt-2">
              <CtaLink href={article.url} external>
                Read story ↗
              </CtaLink>
            </div>
          ) : null}
        </div>

        <p className="mt-10 font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Choose your angle
        </p>

        <ul className="mt-6 divide-y divide-[var(--divider)]">
          {concepts.map((concept, index) => {
            const quote = resolveQuote(catalogue, concept.recommendedPairAddress);
            const disabled = !concept.pairEnabled;
            return (
              <li key={concept.id} className="py-8 first:pt-2">
                <article className={disabled ? 'opacity-50' : ''}>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                    {concept.name}
                  </h2>
                  <p className="mt-1 font-mono text-[13px] tracking-wide text-[var(--muted)]">
                    ${concept.ticker}
                  </p>
                  <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--fg)]">
                    {concept.description}
                  </p>

                  <div className="mt-5">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                      Pair with
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      {quote?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={quote.imageUrl}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-[var(--radius-sm)] object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--scoop-orange)] font-mono text-[10px] text-[var(--scoop-orange-contrast)]">
                          {(quote?.displaySymbol ?? concept.recommendedPairSymbol).slice(0, 3)}
                        </span>
                      )}
                      <div>
                        <p className="font-mono text-[13px]">
                          {quote?.displaySymbol ?? concept.recommendedPairSymbol}
                        </p>
                        <p className="text-sm text-[var(--muted)]">
                          {quote?.name ?? 'Quote unavailable'}
                        </p>
                      </div>
                    </div>
                    {disabled ? (
                      <p className="mt-2 font-mono text-[11px] text-[#b42318]" role="status">
                        This pair is no longer enabled — choose another angle or create manually.
                      </p>
                    ) : (
                      <p className="mt-3 max-w-xl text-sm text-[var(--muted)]">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                          Why this market ·{' '}
                        </span>
                        {concept.pairRationale}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => selectConcept(concept, article)}
                    className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Use this idea →
                  </button>
                </article>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 border-t border-[var(--divider)] pt-8">
          <Link
            href="/launch"
            className="inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
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
