'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { TokenImageState } from '@/lib/launch/types';
import { validateImageFile } from '@/lib/launch/validation';

type Props = {
  image: TokenImageState;
  error?: string;
  onChange: (image: TokenImageState) => void;
  onClear: () => void;
};

export function TokenImageUploader({ image, error, onChange, onClear }: Props) {
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
      });
    },
    [onChange],
  );

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
        {image.previewUrl ? (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt="Token preview"
              className="h-24 w-24 rounded-[var(--radius-md)] object-cover"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate font-mono text-[12px] text-[var(--muted)]">
                {image.fileName}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                Local preview only · IPFS persistence deferred
              </p>
              <div className="flex flex-wrap gap-3">
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
