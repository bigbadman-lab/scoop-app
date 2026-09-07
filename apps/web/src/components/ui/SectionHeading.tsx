type Props = {
  children: React.ReactNode;
  className?: string;
};

export function SectionHeading({ children, className = '' }: Props) {
  return (
    <h2
      className={`font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--muted)] ${className}`}
    >
      {children}
    </h2>
  );
}
