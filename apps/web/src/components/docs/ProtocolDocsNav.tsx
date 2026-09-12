import type { ProtocolDocsSection } from '@/lib/docs/protocol-docs';

type Props = {
  sections: ProtocolDocsSection[];
};

function NavList({ sections }: Props) {
  return (
    <ul className="space-y-1">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="block rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] leading-snug text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_4%,transparent)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="font-mono text-[11px] text-[var(--muted-2)]">
              {String(section.number).padStart(2, '0')}
            </span>{' '}
            {section.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Desktop sticky TOC + mobile accordion topic nav.
 */
export function ProtocolDocsNav({ sections }: Props) {
  return (
    <>
      <details className="group mb-8 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)] marker:content-none [&::-webkit-details-marker]:hidden">
          <span>On this page</span>
          <span aria-hidden className="text-[var(--muted-2)] transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <nav aria-label="Documentation sections" className="border-t border-[var(--divider)] px-2 py-3">
          <NavList sections={sections} />
        </nav>
      </details>

      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
          <p className="px-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Contents
          </p>
          <nav aria-label="Documentation sections" className="mt-3">
            <NavList sections={sections} />
          </nav>
        </div>
      </aside>
    </>
  );
}
