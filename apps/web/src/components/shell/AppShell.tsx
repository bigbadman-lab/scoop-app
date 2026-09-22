'use client';

import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { getActiveAnnouncement } from '@/lib/announcements';
import { AnnouncementBar } from '@/components/home/AnnouncementBar';
import { OfficialTapeContractBar } from '@/components/home/OfficialTapeContractBar';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';
import { ScoopHomeMark } from '@/components/shell/ScoopHomeMark';
import { SiteFooter } from '@/components/shell/SiteFooter';
import { WalletSlot } from '@/components/shell/WalletSlot';
import type { OfficialTapePublic } from '@/lib/official-tape/load-official-tape-public';

export function AppShell({
  children,
  officialTape = null,
}: {
  children: React.ReactNode;
  officialTape?: OfficialTapePublic | null;
}) {
  const pathname = usePathname();
  const announcement = getActiveAnnouncement();
  const hasTopBar = officialTape != null || announcement != null;

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--bg)]"
      style={
        {
          '--announcement-offset': hasTopBar ? 'var(--announcement-height)' : '0px',
        } as CSSProperties
      }
    >
      {/* Full-bleed site strip — sits above sidebar + content as its own band */}
      <div className="sticky top-0 z-50">
        {officialTape ? (
          <OfficialTapeContractBar official={officialTape} />
        ) : (
          <AnnouncementBar announcement={announcement} />
        )}
      </div>

      <DesktopSidebar pathname={pathname} />

      {/* Mobile top identity + Join / account */}
      <header className="sticky top-[var(--announcement-offset)] z-30 flex h-16 items-center gap-3 border-b border-[var(--divider)] bg-[var(--bg)]/95 px-4 backdrop-blur md:hidden">
        <ScoopHomeMark size="mobile" />
        <div className="ml-auto min-w-0 shrink">
          <WalletSlot variant="mobile" />
        </div>
      </header>

      <div className="flex flex-1 flex-col md:pl-[var(--sidebar-width)]">
        {/* Desktop account chrome — in-flow sticky bar so it never overlays page content */}
        <header className="sticky top-[var(--announcement-offset)] z-30 hidden h-14 items-center justify-end border-b border-[var(--divider)] bg-[var(--bg)]/95 px-6 backdrop-blur md:flex lg:px-8">
          <div className="min-w-0 max-w-full">
            <WalletSlot variant="mobile" />
          </div>
        </header>

        <div className="flex flex-1 flex-col pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+1rem)] md:pb-0">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </div>

      <MobileBottomNav pathname={pathname} />
    </div>
  );
}
