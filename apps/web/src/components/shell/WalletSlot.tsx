/**
 * Wallet connect is deferred (Reown/auth not in Phase 1).
 * Reserved icon-sized slot so the sidebar stays stable.
 */
export function WalletSlot({ variant }: { variant: 'sidebar' | 'mobile' }) {
  if (variant === 'sidebar') {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--divider)] text-[var(--muted-2)]"
        title="Wallet connection arrives with auth"
        aria-label="Wallet soon"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          aria-hidden
        >
          <path d="M4.75 8.5A2.75 2.75 0 0 1 7.5 5.75h9A2.75 2.75 0 0 1 19.25 8.5v7A2.75 2.75 0 0 1 16.5 18.25h-9A2.75 2.75 0 0 1 4.75 15.5z" />
          <path d="M14.5 12h4.75v0a2 2 0 0 0-2-2H14.5a1.5 1.5 0 1 0 0 3z" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted-2)]"
      title="Wallet connection arrives with auth"
    >
      Wallet soon
    </div>
  );
}
