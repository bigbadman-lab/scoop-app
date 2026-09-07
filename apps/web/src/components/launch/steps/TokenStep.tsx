'use client';

import type { FieldErrors, LaunchFormState } from '@/lib/launch/types';
import { META_LIMITS } from '@/lib/launch/types';
import { TokenImageUploader } from '@/components/launch/TokenImageUploader';
import type { TokenImageState } from '@/lib/launch/types';
import type { LaunchAssistArticle } from '@/lib/launch-assist/types';
import { CtaLink } from '@/components/ui/CtaLink';
import { NewsAge } from '@/components/news/NewsAge';

type Props = {
  state: LaunchFormState;
  errors: FieldErrors;
  provenance?: LaunchAssistArticle | null;
  onPatch: (patch: Partial<LaunchFormState>) => void;
  onTicker: (ticker: string) => void;
  onImage: (image: TokenImageState) => void;
  onClearImage: () => void;
};

function Field({
  error,
  children,
  hint,
}: {
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      {children}
      {hint ? (
        <p className="mt-1 font-mono text-[10px] text-[var(--muted-2)]">{hint}</p>
      ) : null}
      {error ? (
        <p className="mt-1 font-mono text-[11px] text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'w-full min-h-10 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 text-[15px] text-[var(--fg)] outline-none transition-colors placeholder:text-[var(--muted-2)] focus:border-[var(--fg)]';

export function TokenStep({
  state,
  errors,
  provenance,
  onPatch,
  onTicker,
  onImage,
  onClearImage,
}: Props) {
  return (
    <div className="space-y-2.5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">What are you launching?</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Name, ticker, and artwork define the token. Socials are optional.
        </p>
      </div>

      {provenance ? (
        <div className="mb-2 space-y-1 border-b border-[var(--divider)] pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-2)]">
            From the news
          </p>
          <p className="text-sm font-medium tracking-tight text-[var(--fg)]">
            {provenance.headline}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {provenance.sourceDomain}
            <span className="text-[var(--muted-2)]"> · </span>
            <NewsAge iso={provenance.publishedAt} />
          </p>
          {provenance.url ? (
            <div className="pt-1">
              <CtaLink href={provenance.url} external>
                Read story ↗
              </CtaLink>
            </div>
          ) : null}
        </div>
      ) : null}

      <Field error={errors.name}>
        <input
          id="launch-name"
          className={inputClass}
          value={state.name}
          maxLength={META_LIMITS.nameMax}
          autoComplete="off"
          placeholder="Name"
          aria-label="Name"
          onChange={(e) => onPatch({ name: e.target.value })}
        />
      </Field>

      <Field error={errors.ticker}>
        <input
          id="launch-ticker"
          className={`${inputClass} font-mono uppercase`}
          value={state.ticker}
          maxLength={META_LIMITS.tickerMax}
          autoComplete="off"
          spellCheck={false}
          placeholder="Ticker"
          aria-label="Ticker"
          onChange={(e) => onTicker(e.target.value)}
        />
      </Field>

      <Field
        error={errors.description}
        hint={`${state.description.trim().length}/${META_LIMITS.descriptionMax}`}
      >
        <textarea
          id="launch-description"
          className={`${inputClass} min-h-20 resize-y py-2`}
          value={state.description}
          maxLength={META_LIMITS.descriptionMax}
          placeholder="Description"
          aria-label="Description"
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </Field>

      <Field error={errors.twitter}>
        <input
          id="launch-x"
          className={inputClass}
          value={state.twitter}
          placeholder="X (optional) · https://x.com/…"
          aria-label="X (optional)"
          onChange={(e) => onPatch({ twitter: e.target.value })}
        />
      </Field>

      <Field error={errors.telegram}>
        <input
          id="launch-tg"
          className={inputClass}
          value={state.telegram}
          placeholder="Telegram (optional) · https://t.me/…"
          aria-label="Telegram (optional)"
          onChange={(e) => onPatch({ telegram: e.target.value })}
        />
      </Field>

      <TokenImageUploader
        image={state.image}
        error={errors.image}
        onChange={onImage}
        onClear={onClearImage}
      />
    </div>
  );
}
