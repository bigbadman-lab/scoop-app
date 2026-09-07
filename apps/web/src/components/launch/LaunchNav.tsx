type Props = {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueDisabledReason?: string;
};

export function LaunchNav({
  onBack,
  onContinue,
  continueLabel = 'Continue →',
  continueDisabled = false,
  continueDisabledReason,
}: Props) {
  return (
    <div className="relative mt-6 border-t border-[var(--divider)] pt-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex min-h-10 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--fg)] sm:absolute sm:left-0 sm:top-4 sm:mb-0"
        >
          ← Back
        </button>
      ) : null}

      <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-1.5 sm:items-center">
        <button
          type="button"
          onClick={onContinue}
          disabled={continueDisabled}
          title={continueDisabled ? continueDisabledReason : undefined}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-8 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity enabled:hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {continueLabel}
        </button>
        {continueDisabled && continueDisabledReason ? (
          <p className="max-w-md text-center font-mono text-[10px] text-[var(--muted-2)]">
            {continueDisabledReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}
