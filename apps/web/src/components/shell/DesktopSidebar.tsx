import Image from 'next/image';
import Link from 'next/link';
import { SCOOP_MARK_SRC } from '@/lib/brand';
import { WalletSlot } from '@/components/shell/WalletSlot';
import { isNavActive, PRIMARY_NAV } from '@/components/shell/nav';
import { NavIcon } from '@/components/shell/NavIcons';

type Props = {
  pathname: string;
};

export function DesktopSidebar({ pathname }: Props) {
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col border-r border-[var(--divider)] bg-[var(--bg-elevated)] md:flex"
      aria-label="Primary"
    >
      <div className="flex flex-1 flex-col items-center px-2.5 py-6">
        <Link
          href="/"
          aria-label="SCOOP home"
          className="mb-8 inline-flex focus-visible:outline-offset-4"
        >
          <Image
            src={SCOOP_MARK_SRC}
            alt=""
            width={72}
            height={72}
            className="h-[4.25rem] w-[4.25rem] object-contain"
            priority
          />
        </Link>

        <nav className="flex w-full flex-col items-center gap-2.5" aria-label="Main">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            const isCreate = item.id === 'create';

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative flex w-full flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-1 py-2.5 transition-colors',
                  active && !isCreate
                    ? 'text-[var(--fg)]'
                    : 'text-[var(--muted)] hover:text-[var(--fg)]',
                  !isCreate ? 'hover:bg-[var(--bg)]' : '',
                ].join(' ')}
              >
                {!isCreate && active ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-r bg-[var(--scoop-orange)]"
                  />
                ) : null}
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
                <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex w-full flex-col items-center pt-4">
          <WalletSlot variant="sidebar" />
        </div>
      </div>
    </aside>
  );
}
