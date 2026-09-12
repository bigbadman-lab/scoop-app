'use client';

import { useState } from 'react';

const FEEDBACK_MS = 1600;

type Props = {
  className?: string;
  /** Accessible label before copy succeeds. */
  label?: string;
  /** Accessible label after a successful copy. */
  copiedLabel?: string;
};

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="18" cy="5" r="2.25" />
      <circle cx="6" cy="12" r="2.25" />
      <circle cx="18" cy="19" r="2.25" />
      <path d="M8.1 10.9 15.9 6.1" />
      <path d="M8.1 13.1 15.9 17.9" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/**
 * Icon utility — copies the current page URL (market/token detail).
 * Feedback mirrors ContractCopy (checkmark + ~1.6s reset); no native share sheet.
 */
export function CopyMarketLinkButton({
  className = '',
  label = 'Copy market link',
  copiedLabel = 'Market link copied',
}: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy(event: React.MouseEvent | React.KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onCopy(e);
      }}
      className={[
        'inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] transition-colors hover:border-[var(--fg)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={copied ? copiedLabel : label}
      data-testid="copy-market-link"
      data-copied={copied ? 'true' : 'false'}
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5 text-[var(--scoop-live)]" />
      ) : (
        <ShareIcon className="h-3.5 w-3.5" />
      )}
      {copied ? (
        <span className="normal-case tracking-normal text-[var(--fg)]" aria-hidden>
          Copied
        </span>
      ) : null}
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
