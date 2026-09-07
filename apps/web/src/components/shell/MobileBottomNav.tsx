import Link from 'next/link';
import { MOBILE_NAV, isNavActive } from '@/components/shell/nav';
import { NavIcon } from '@/components/shell/NavIcons';

type Props = {
  pathname: string;
};

export function MobileBottomNav({ pathname }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--divider)] bg-[var(--bg-elevated)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Mobile"
    >
      <ul className="grid h-[var(--bottom-nav-height)] grid-cols-4">
        {MOBILE_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          const isCreate = item.id === 'create';

          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-full min-h-11 flex-col items-center justify-center gap-1 px-1',
                  active && !isCreate
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
                    isCreate
                      ? 'bg-[var(--scoop-orange)] text-[var(--scoop-orange-contrast)]'
                      : '',
                  ].join(' ')}
                >
                  <NavIcon id={item.id} className="h-5 w-5" />
                </span>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em]">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
