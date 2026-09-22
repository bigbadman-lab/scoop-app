type Props = {
  lockBadgeCopy?: string | null;
};

/**
 * Restrained official markers on the standard token page header.
 */
export function OfficialTapeTokenBadges({ lockBadgeCopy = null }: Props) {
  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5"
      data-testid="official-tape-token-badges"
    >
      <span className="rounded-[var(--radius-sm)] bg-[var(--scoop-green)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--scoop-green-contrast)]">
        Official $TAPE
      </span>
      {lockBadgeCopy ? (
        <span
          className="rounded-[var(--radius-sm)] border border-[var(--divider)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]"
          data-testid="official-tape-token-lock-badge"
        >
          {lockBadgeCopy}
        </span>
      ) : null}
    </div>
  );
}
