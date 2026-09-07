import Link from 'next/link';

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'on-orange';
  className?: string;
  external?: boolean;
};

export function CtaLink({
  href,
  children,
  variant = 'ghost',
  className = '',
  external = false,
}: Props) {
  const base =
    'inline-flex min-h-11 items-center gap-2 font-mono text-[12px] uppercase tracking-[0.14em] transition-opacity hover:opacity-80';
  const styles =
    variant === 'primary'
      ? 'rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-4 text-[var(--scoop-orange-contrast)]'
      : variant === 'on-orange'
        ? 'text-[var(--scoop-orange-contrast)] underline-offset-4 hover:underline'
        : 'text-[var(--fg)]';

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${styles} ${className}`}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={`${base} ${styles} ${className}`}>
      {children}
    </Link>
  );
}
