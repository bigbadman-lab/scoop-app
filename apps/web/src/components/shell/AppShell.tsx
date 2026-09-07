'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SCOOP_MARK_SRC } from '@/lib/brand';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <DesktopSidebar pathname={pathname} />

      {/* Mobile top identity — mark only */}
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[var(--divider)] bg-[var(--bg)]/95 px-4 backdrop-blur md:hidden">
        <Link href="/" aria-label="SCOOP home" className="inline-flex">
          <Image
            src={SCOOP_MARK_SRC}
            alt=""
            width={52}
            height={52}
            className="h-[3.25rem] w-[3.25rem] object-contain"
            priority
          />
        </Link>
        <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Live
        </span>
      </header>

      <div className="md:pl-[var(--sidebar-width)]">
        <div className="pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1rem)] md:pb-0">
          {children}
        </div>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
