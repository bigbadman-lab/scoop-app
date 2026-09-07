'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';
import { validateImageFile } from '@/lib/launch/validation';
import type {
  LaunchAssistArticle,
  PublicArtworkOption,
  PublicLaunchConcept,
  SelectedTokenImage,
} from '@/lib/launch-assist/types';

type Selection =
  | { kind: 'generated'; image: PublicArtworkOption }
  | { kind: 'upload'; file: SelectedTokenImage & { source: 'upload' } };

type Props = {
  article: LaunchAssistArticle;
  concept: PublicLaunchConcept;
  draftId: string;
  images: PublicArtworkOption[];
  onContinue: (image: SelectedTokenImage) => void;
  continuing?: boolean;
};

export function ArtworkChooser({
  article,
  concept,
  draftId,
  images,
  onContinue,
  continuing = false,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function applyUpload(file: File | null | undefined) {
    if (!file) return;
    const validation = validateImageFile(file);
    if (validation) {
      setUploadError(validation);
      return;
    }
    setUploadError(null);
    const previewUrl = URL.createObjectURL(file);
    setSelection({
      kind: 'upload',
      file: {
        source: 'upload',
        previewUrl,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
      },
    });
  }

  function resolveSelected(): SelectedTokenImage | null {
    if (!selection) return null;
    if (selection.kind === 'generated') {
      return {
        source: 'generated',
        previewUrl: selection.image.previewUrl,
        fileName: `token-${selection.image.index}.png`,
        mimeType: selection.image.mimeType,
        byteSize: null,
        artworkAssetId: selection.image.assetId,
        draftId,
      };
    }
    return selection.file;
  }

  const canContinue = resolveSelected() != null && !continuing;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Choose your look
      </p>

      <div className="mt-4 space-y-1 border-b border-[var(--divider)] pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]">
          From the news
        </p>
        <p className="text-lg font-semibold tracking-tight md:text-xl">{article.headline}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          {article.sourceDomain}
          <span className="text-[var(--muted-2)]"> · </span>
          <NewsAge iso={article.publishedAt} />
        </p>
        {article.url ? (
          <div className="pt-1">
            <CtaLink href={article.url} external>
              Read story ↗
            </CtaLink>
          </div>
        ) : null}
        <p className="pt-3 text-sm text-[var(--muted)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
            Idea ·{' '}
          </span>
          {concept.name} · ${concept.ticker}
        </p>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {images.map((image) => {
          const selected =
            selection?.kind === 'generated' &&
            selection.image.assetId === image.assetId;
          return (
            <li key={image.assetId}>
              <button
                type="button"
                aria-pressed={selected}
                aria-label={`Select artwork ${String(image.index).padStart(2, '0')}`}
                onClick={() => setSelection({ kind: 'generated', image })}
                className={[
                  'group relative block w-full overflow-hidden rounded-[var(--radius-md)] border-2 bg-[var(--bg-elevated)] transition-colors',
                  selected
                    ? 'border-[var(--fg)]'
                    : 'border-[var(--divider)] hover:border-[var(--muted)]',
                ].join(' ')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt=""
                  width={image.width}
                  height={image.height}
                  className="aspect-square w-full object-cover"
                />
                <span className="absolute left-2 top-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--fg)] mix-blend-difference">
                  {String(image.index).padStart(2, '0')}
                </span>
                {selected ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--scoop-orange)] font-mono text-[11px] text-[var(--scoop-orange-contrast)]"
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 space-y-3 border-t border-[var(--divider)] pt-8">
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => applyUpload(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
        >
          Upload your own
        </button>
        {selection?.kind === 'upload' ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selection.file.previewUrl}
              alt="Uploaded token preview"
              className="h-16 w-16 rounded-[var(--radius-md)] object-cover"
            />
            <div>
              <p className="font-mono text-[12px] text-[var(--muted)]">
                {selection.file.fileName}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--scoop-orange)]">
                Selected upload
              </p>
            </div>
          </div>
        ) : null}
        {uploadError ? (
          <p className="font-mono text-[11px] text-[#b42318]" role="alert">
            {uploadError}
          </p>
        ) : null}
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/launch"
          className="inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          Continue manually →
        </Link>
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            const image = resolveSelected();
            if (image) onContinue(image);
          }}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-6 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {continuing ? 'Continuing…' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
