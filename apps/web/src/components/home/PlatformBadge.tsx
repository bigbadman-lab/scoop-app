import type { ReactNode } from 'react';

type Props = {
  icon: ReactNode;
  eyebrow: string;
  value: string;
  className?: string;
};

/**
 * Compact non-interactive infrastructure / product badge for the homepage hero.
 * Sized to share one mobile row with siblings (`flex-1 min-w-0`).
 */
export function PlatformBadge({ icon, eyebrow, value, className = '' }: Props) {
  return (
    <div
      className={[
        'inline-flex h-11 min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-2 sm:h-[52px] sm:flex-none sm:gap-2.5 sm:rounded-[var(--radius-lg)] sm:px-3',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="platform-badge"
    >
      <div className="shrink-0" aria-hidden>
        {icon}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[9px] font-medium text-[var(--muted)] sm:text-[11px]">
          {eyebrow}
        </p>
        <p className="truncate text-[11px] font-semibold tracking-tight text-[var(--fg)] sm:text-[13px]">
          {value}
        </p>
      </div>
    </div>
  );
}
