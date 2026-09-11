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
      <ul className="grid h-[var(--bottom-nav-height)] grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = isNavActive(pathname, item.href);
          const isCreate = item.id === 'create';

          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex h-full min-h-11 items-center justify-center px-1',
                  active && !isCreate
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)]',
                    isCreate
                      ? 'bg-[var(--scoop-orange)] text-[var(--scoop-orange-contrast)]'
                      : '',
                  ].join(' ')}
                >
                  <NavIcon id={item.id} className="h-7 w-7" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
