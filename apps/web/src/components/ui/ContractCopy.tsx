'use client';

import { useState } from 'react';
import { truncateAddress } from '@/lib/format';

type Props = {
  address: string;
  className?: string;
};

/** Copy control — stops navigation when nested inside a link. */
export function ContractCopy({ address, className = '' }: Props) {
  const [copied, setCopied] = useState(false);

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
      aria-label={copied ? 'Address copied' : `Copy contract ${address}`}
    >
      <span>{truncateAddress(address)}</span>
      <span aria-hidden className="text-[var(--muted-2)]">
        {copied ? '✓' : '⧉'}
      </span>
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
