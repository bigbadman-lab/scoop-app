'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { TokenImageState } from '@/lib/launch/types';
import { validateImageFile } from '@/lib/launch/validation';

type Props = {
  image: TokenImageState;
  error?: string;
  onChange: (image: TokenImageState) => void;
  onClear: () => void;
  onRetryArtwork?: () => void;
  onGenerateAnother?: () => void;
  generateAnotherDisabled?: boolean;
};

function ReservedFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-24 flex-col items-center justify-center gap-2 px-2 py-1 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
      <div className="h-24 w-24 shrink-0 rounded-[var(--radius-md)] bg-[var(--bg-elevated)] motion-safe:animate-pulse motion-reduce:animate-none" />
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  );
}

export function TokenImageUploader({
  image,
  error,
  onChange,
  onClear,
  onRetryArtwork,
  onGenerateAnother,
  generateAnotherDisabled = false,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const applyFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      const validation = validateImageFile(file);
      if (validation) {
        setLocalError(validation);
        return;
      }
      setLocalError(null);
      const previewUrl = URL.createObjectURL(file);
      onChange({
        previewUrl,
        fileName: file.name,
        mimeType: file.type,
        byteSize: file.size,
        persistence: 'local_only',
        ipfsUri: null,
        displayImagePath: null,
        source: 'user',
        artworkStatus: 'ready',
        artworkError: null,
        artworkAssetId: null,
      });
    },
    [onChange],
  );

  const regenerating = image.artworkStatus === 'regenerating';
  const pending =
    !regenerating &&
    image.source === 'ai_pending' &&
    (image.artworkStatus === 'pending' || image.artworkStatus === 'generating');
  const failed =
    image.source === 'ai_pending' && image.artworkStatus === 'failed';
  const showReady =
    Boolean(image.previewUrl) && !regenerating && !pending && !failed;

  return (
    <div>
      <div
        className={[
          'rounded-[var(--radius-lg)] border border-dashed border-[var(--divider)] p-3 transition-colors',
          dragOver ? 'border-[var(--scoop-orange)] bg-[var(--bg-elevated)]' : '',
        ].join(' ')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          applyFile(e.dataTransfer.files?.[0]);
        }}
      >
        {regenerating ? (
          <div role="status" aria-live="polite">
            <ReservedFrame>
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)]">
                Generating a new image…
              </p>
              <p className="text-sm text-[var(--muted)]">
                You can continue. We’ll let you know when it’s ready.
              </p>
              <button
                type="button"
                className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
                onClick={() => inputRef.current?.click()}
              >
                Upload your own instead
              </button>
            </ReservedFrame>
          </div>
        ) : pending ? (
          <div role="status" aria-live="polite">
            <ReservedFrame>
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)]">
                Generating your token image…
              </p>
              <p className="text-sm text-[var(--muted)]">
                You can continue setting up your token.
              </p>
              <p className="text-sm text-[var(--muted)]">
                We’ll let you know when your image is ready.
              </p>
              <button
                type="button"
                className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
                onClick={() => inputRef.current?.click()}
              >
                Upload your own instead
              </button>
            </ReservedFrame>
          </div>
        ) : failed ? (
          <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center sm:flex-row sm:text-left">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)]">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
                Failed
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-[var(--muted)]" role="alert">
                Image generation failed
              </p>
              <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
                {onRetryArtwork ? (
                  <button
                    type="button"
                    className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] underline-offset-4 hover:underline"
                    onClick={onRetryArtwork}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-9 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
                  onClick={() => inputRef.current?.click()}
                >
                  Upload image
                </button>
              </div>
            </div>
          </div>
        ) : showReady ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl!}
              alt="Token preview"
              className="h-24 w-24 rounded-[var(--radius-md)] object-cover"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate font-mono text-[12px] text-[var(--muted)]">
                {image.fileName}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                {image.source === 'ai'
                  ? 'AI artwork · local preview'
                  : 'Local preview only · IPFS persistence deferred'}
              </p>
              <div className="flex flex-wrap gap-3">
                {image.source === 'ai' && onGenerateAnother ? (
                  <button
                    type="button"
                    disabled={generateAnotherDisabled}
                    className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={onGenerateAnother}
                  >
                    Generate another
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] underline-offset-4 hover:underline"
                  onClick={() => inputRef.current?.click()}
                >
                  Replace
                </button>
                <button
                  type="button"
                  className="min-h-10 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] underline-offset-4 hover:underline"
                  onClick={() => {
                    setLocalError(null);
                    onClear();
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full min-h-20 flex-col items-center justify-center gap-1.5 text-center"
            onClick={() => inputRef.current?.click()}
          >
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--fg)]">
              Token image · drop or browse
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
              PNG · JPEG · WebP · max 5MB
            </span>
          </button>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Token image"
          className="sr-only"
          onChange={(e) => applyFile(e.target.files?.[0])}
        />
      </div>
      {(localError || error) && (
        <p className="mt-2 font-mono text-[11px] text-[#b42318]" role="alert">
          {localError || error}
        </p>
      )}
    </div>
  );
}
