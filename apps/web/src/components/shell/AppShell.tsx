'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SCOOP_MARK_SRC } from '@/lib/brand';
import { getActiveAnnouncement } from '@/lib/announcements';
import { AnnouncementBar } from '@/components/home/AnnouncementBar';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';
import { WalletSlot } from '@/components/shell/WalletSlot';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const announcement = getActiveAnnouncement();
  const hasAnnouncement = announcement != null;

  return (
    <div
      className="min-h-dvh bg-[var(--bg)]"
      style={
        {
          '--announcement-offset': hasAnnouncement ? 'var(--announcement-height)' : '0px',
        } as CSSProperties
      }
    >
      {/* Full-bleed site strip — sits above sidebar + content as its own band */}
      <div className="sticky top-0 z-50">
        <AnnouncementBar announcement={announcement} />
      </div>

      <DesktopSidebar pathname={pathname} />

      {/* Mobile top identity + Connect (C.1 — full auth chrome redesign is C.3) */}
      <header className="sticky top-[var(--announcement-offset)] z-30 flex h-16 items-center gap-3 border-b border-[var(--divider)] bg-[var(--bg)]/95 px-4 backdrop-blur md:hidden">
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
        <div className="ml-auto">
          <WalletSlot variant="mobile" />
        </div>
      </header>

      {/* Desktop top-right Connect — same control as sidebar for discoverability */}
      <div className="pointer-events-none fixed inset-x-0 top-[var(--announcement-offset)] z-30 hidden h-16 items-center justify-end px-8 md:flex md:pl-[var(--sidebar-width)]">
        <div className="pointer-events-auto">
          <WalletSlot variant="mobile" />
        </div>
      </div>

      <div className="md:pl-[var(--sidebar-width)]">
        <div className="pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1rem)] md:pb-0 md:pt-4">
          {children}
        </div>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
