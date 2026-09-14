'use client';

import { useState } from 'react';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { robinhoodAddressUrl } from '@/lib/chain/explorer';
import { truncateAddress } from '@/lib/format';

type Props = {
  address: `0x${string}` | null;
};

export function TapeContractCard({ address }: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="border border-[var(--divider)] bg-[var(--bg)] px-4 py-5 md:px-6 md:py-6"
      data-testid="tape-contract-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Official contract
          </p>
          <p className="mt-2 font-mono text-xl font-semibold tracking-tight text-[var(--fg)]">
            $TAPE
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Robinhood Chain · {ROBINHOOD_CHAIN_ID}
          </p>
        </div>

        {address ? (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <code
              className="break-all font-mono text-sm text-[var(--fg)]"
              data-testid="tape-contract-address"
            >
              {address}
            </code>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onCopy()}
                className="border border-[var(--divider)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] hover:border-[var(--fg)]"
                data-testid="tape-contract-copy"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={robinhoodAddressUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-[var(--divider)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--fg)] hover:border-[var(--fg)]"
                data-testid="tape-contract-explorer"
              >
                Explorer
              </a>
            </div>
            <p className="font-mono text-[11px] text-[var(--muted-2)] sm:text-right">
              {truncateAddress(address, 8, 6)}
            </p>
          </div>
        ) : (
          <div data-testid="tape-contract-tba">
            <p className="font-mono text-lg font-semibold tracking-tight text-[var(--fg)]">
              Contract: To be announced
            </p>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
              The official $TAPE address will appear here once configured.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
