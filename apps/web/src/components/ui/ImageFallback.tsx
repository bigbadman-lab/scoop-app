type Props = {
  label?: string;
  className?: string;
  size?: number;
  variant?: 'token' | 'house';
};

/** Branded fallback when artwork/house imagery is missing. */
export function ImageFallback({
  label = 'SCOOP',
  className = '',
  size = 160,
  variant = 'token',
}: Props) {
  if (variant === 'house') {
    return (
      <div
        className={`relative flex w-full items-end overflow-hidden rounded-[var(--radius-editorial)] bg-[var(--scoop-orange)] ${className}`}
        style={{ aspectRatio: '1.5 / 1' }}
        role="img"
        aria-label="SCOOP editorial placeholder"
      >
        <div className="absolute inset-0 opacity-[0.12]" aria-hidden>
          <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-white" />
          <div className="absolute bottom-6 left-8 h-24 w-24 rounded-full bg-black/20" />
        </div>
        <p className="relative p-6 font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--scoop-orange-contrast)]">
          House image placeholder · add curated set under public/house/
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex aspect-square items-center justify-center rounded-[var(--radius-lg)] bg-[var(--scoop-orange)] ${className}`}
      style={{ width: size, maxWidth: '100%' }}
      role="img"
      aria-label={label || 'Token artwork unavailable'}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--scoop-orange-contrast)]">
        Scoop
      </span>
    </div>
  );
}
