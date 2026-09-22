'use client';

import Link from 'next/link';
import { ContractCopy } from '@/components/ui/ContractCopy';
import type { OfficialTapePublic } from '@/lib/official-tape/load-official-tape-public';

type Props = {
  official: OfficialTapePublic;
};

/**
 * Homepage / shell strip — official $TAPE contract with exact mint copy.
 */
export function OfficialTapeContractBar({ official }: Props) {
  return (
    <div
      className="flex min-h-[var(--announcement-height)] w-full items-center bg-[var(--scoop-green)] text-[var(--scoop-green-contrast)]"
      data-testid="official-tape-contract-bar"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 md:px-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]">
          Official $TAPE contract
        </span>
        <span className="hidden text-white/40 sm:inline" aria-hidden>
          ·
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
          Solana
        </span>
        <Link
          href={official.tokenHref}
          className="min-w-0 max-w-[min(100%,22rem)] truncate font-mono text-[11px] text-white underline-offset-2 hover:underline sm:max-w-[28rem] sm:text-[12px]"
          title={official.mint}
          data-testid="official-tape-contract-link"
        >
          {official.mint}
        </Link>
        <ContractCopy
          address={official.mint}
          display="full"
          feedback="text"
          className="!min-h-8 text-white/85 hover:text-white [&_[data-testid=contract-copy-address]]:sr-only"
          label={`Copy official $TAPE mint ${official.mint}`}
          copiedLabel="Official mint copied"
        />
        {official.lockVerified && official.lockBadgeCopy ? (
          <span
            className="w-full text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/90 sm:ml-1 sm:w-auto sm:text-left"
            data-testid="official-tape-lock-badge"
          >
            {official.lockBadgeCopy}
          </span>
        ) : null}
      </div>
    </div>
  );
}
