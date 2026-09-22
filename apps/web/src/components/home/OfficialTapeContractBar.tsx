'use client';

import Link from 'next/link';
import { ContractCopy } from '@/components/ui/ContractCopy';
import type { OfficialTapePublic } from '@/lib/official-tape/load-official-tape-public';

type Props = {
  official: OfficialTapePublic;
};

/**
 * Thin site strip — official $TAPE contract with exact mint copy.
 * Single line on mobile; visual truncation OK, clipboard stays full mint.
 */
export function OfficialTapeContractBar({ official }: Props) {
  return (
    <div
      className="flex h-[var(--announcement-height)] w-full items-center bg-[var(--scoop-green)] text-[var(--scoop-green-contrast)]"
      data-testid="official-tape-contract-bar"
    >
      <div className="mx-auto flex h-full w-full max-w-[1400px] items-center gap-1.5 overflow-hidden px-3 sm:gap-2.5 md:gap-3 md:px-8">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.16em]">
          Official $TAPE
        </span>
        <span className="hidden shrink-0 text-white/40 sm:inline" aria-hidden>
          ·
        </span>
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/75 sm:inline">
          Solana
        </span>
        <Link
          href={official.tokenHref}
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-white underline-offset-2 hover:underline sm:text-[11px] md:text-[12px]"
          title={official.mint}
          data-testid="official-tape-contract-link"
        >
          {official.mint}
        </Link>
        <ContractCopy
          address={official.mint}
          display="full"
          feedback="icon"
          className="!min-h-0 shrink-0 gap-1 py-0 text-[10px] text-white/85 hover:text-white [&_[data-testid=contract-copy-address]]:sr-only"
          label={`Copy official $TAPE mint ${official.mint}`}
          copiedLabel="Official mint copied"
        />
        {official.lockVerified && official.lockBadgeCopy ? (
          <>
            <span
              className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-white/85 md:hidden"
              data-testid="official-tape-lock-badge"
            >
              Locked
            </span>
            <span
              className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-white/90 md:inline"
              data-testid="official-tape-lock-badge-full"
            >
              {official.lockBadgeCopy}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
