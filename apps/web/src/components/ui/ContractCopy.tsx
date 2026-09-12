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
};

/** Copy control — stops navigation when nested inside a link. */
export function ContractCopy({
  address,
  className = '',
  label,
  copiedLabel,
}: Props) {
  const [copied, setCopied] = useState(false);
  const idleLabel = label ?? `Copy contract ${address}`;
  const doneLabel = copiedLabel ?? 'Address copied';

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
      className={`inline-flex min-h-9 items-center gap-2 rounded-[var(--radius-sm)] font-mono text-[11px] text-[var(--muted)] hover:text-[var(--fg)] ${className}`}
      aria-label={copied ? doneLabel : idleLabel}
      data-testid="contract-copy"
      data-copied={copied ? 'true' : 'false'}
    >
      <span data-testid="contract-copy-address">{truncateAddress(address)}</span>
      <span aria-hidden className="text-[var(--muted-2)]">
        {copied ? '✓ Copied' : '⧉'}
      </span>
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
