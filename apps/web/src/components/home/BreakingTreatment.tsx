/**
 * Reserved full-width interrupt for future breaking news in discovery.
 * Not rendered with fabricated content — export for later grid insertion.
 */
export function BreakingTreatment({
  eyebrow = 'Breaking',
  title,
  href,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
}) {
  const body = (
    <div className="rounded-[var(--radius-xl)] bg-[var(--scoop-orange)] px-6 py-8 text-[var(--scoop-orange-contrast)] md:px-10 md:py-10">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em]">{eyebrow}</p>
      <p className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">{title}</p>
    </div>
  );

  if (!href) return body;
  return (
    <a href={href} className="block focus-visible:outline-offset-4">
      {body}
    </a>
  );
}
