'use client';

import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { getActiveAnnouncement } from '@/lib/announcements';
import { AnnouncementBar } from '@/components/home/AnnouncementBar';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';
import { ScoopHomeMark } from '@/components/shell/ScoopHomeMark';
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

      {/* Mobile top identity + Join / account */}
      <header className="sticky top-[var(--announcement-offset)] z-30 flex h-16 items-center gap-3 border-b border-[var(--divider)] bg-[var(--bg)]/95 px-4 backdrop-blur md:hidden">
        <ScoopHomeMark size="mobile" />
        <div className="ml-auto min-w-0 shrink">
          <WalletSlot variant="mobile" />
        </div>
      </header>

      <div className="md:pl-[var(--sidebar-width)]">
        {/* Desktop account chrome — in-flow sticky bar so it never overlays page content */}
        <header className="sticky top-[var(--announcement-offset)] z-30 hidden h-14 items-center justify-end border-b border-[var(--divider)] bg-[var(--bg)]/95 px-6 backdrop-blur md:flex lg:px-8">
          <div className="min-w-0 max-w-full">
            <WalletSlot variant="mobile" />
          </div>
        </header>

        <div className="pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1rem)] md:pb-0">
          {children}
        </div>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
