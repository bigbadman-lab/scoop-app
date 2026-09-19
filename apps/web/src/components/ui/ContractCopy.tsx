'use client';

import { useState } from 'react';
import { truncateAddress } from '@/lib/format';

type Props = {
  address: string;
  className?: string;
  /** Accessible label before copy succeeds. */
  label?: string;
  /** Accessible label after a successful copy. */
  copiedLabel?: string;
  /**
   * `truncated` (default): shortened mono preview.
   * `full`: prefer full address; CSS may truncate visually on narrow screens.
   * Clipboard always receives the complete address.
   */
  display?: 'truncated' | 'full';
  /**
   * `icon` (default): ⧉ / ✓ Copied.
   * `text`: Copy / Copied (launch success, TAPE-style).
   */
  feedback?: 'icon' | 'text';
};

/** Copy control — stops navigation when nested inside a link. */
export function ContractCopy({
  address,
  className = '',
  label,
  copiedLabel,
  display = 'truncated',
  feedback = 'icon',
}: Props) {
  const [copied, setCopied] = useState(false);
  const idleLabel = label ?? `Copy contract ${address}`;
  const doneLabel = copiedLabel ?? 'Address copied';
  const visibleAddress =
    display === 'full' ? address : truncateAddress(address);

  async function onCopy(event: React.MouseEvent | React.KeyboardEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
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
      className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--muted)] hover:text-[var(--fg)] ${className}`}
      aria-label={copied ? doneLabel : idleLabel}
      title={address}
      data-testid="contract-copy"
      data-copied={copied ? 'true' : 'false'}
    >
      <span
        data-testid="contract-copy-address"
        className={display === 'full' ? 'min-w-0 truncate' : undefined}
      >
        {visibleAddress}
      </span>
      <span
        aria-hidden
        className={`shrink-0 ${
          feedback === 'text'
            ? 'uppercase tracking-[0.12em] text-[var(--scoop-green)]'
            : 'text-[var(--muted-2)]'
        }`}
        data-testid="contract-copy-feedback"
      >
        {feedback === 'text'
          ? copied
            ? 'Copied'
            : 'Copy'
          : copied
            ? '✓ Copied'
            : '⧉'}
      </span>
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
