import Link from 'next/link';

type Props = {
  providerArticleId: string;
  variant?: 'primary' | 'feed' | 'another';
  className?: string;
};

/**
 * Reusable Launch as Token CTA — carries canonical providerArticleId only.
 */
export function LaunchAsTokenLink({
  providerArticleId,
  variant = 'primary',
  className = '',
}: Props) {
  const id = providerArticleId.trim();
  if (!id) return null;

  const href = `/news/${encodeURIComponent(id)}/launch`;
  const label =
    variant === 'another' ? 'Launch another market →' : 'Launch as token →';

  if (variant === 'primary') {
    return (
      <Link
        href={href}
        className={[
          'inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-4 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] transition-opacity hover:opacity-90',
          className,
        ].join(' ')}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={[
        'inline-flex min-h-9 items-center font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] transition-colors hover:text-[var(--scoop-orange)] focus-visible:text-[var(--scoop-orange)]',
        className,
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
