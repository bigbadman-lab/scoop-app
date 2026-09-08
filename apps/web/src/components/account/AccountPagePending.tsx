/**
 * Neutral /account boot frame — matches signed-in AccountShell geometry.
 * Do not use the Join SCOOP composition here: signed-in navigations flash that
 * destination for a beat and read as a glitch.
 */
export function AccountPagePending() {
  return (
    <main
      className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16"
      aria-busy="true"
      aria-label="Loading account"
    >
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        Account
      </p>
      <div
        className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start"
        aria-hidden
      >
        <div className="h-[88px] w-[88px] shrink-0 rounded-full bg-[var(--divider)]" />
        <div className="min-w-0 flex-1 space-y-3 pt-1">
          <div className="h-9 max-w-[14rem] rounded bg-[var(--divider)]" />
          <div className="h-3 max-w-[7rem] rounded bg-[var(--divider)]" />
          <div className="h-11 max-w-md rounded-[var(--radius-md)] bg-[var(--divider)]" />
        </div>
      </div>
    </main>
  );
}
