import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';
import { AppShell } from '@/components/shell/AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/token/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
}));

vi.mock('next/image', () => ({
  default: (props: { alt: string; priority?: boolean; src?: string }) => {
    const { priority: _p, ...rest } = props;
    void _p;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} alt={props.alt} />;
  },
}));

vi.mock('@/components/shell/WalletSlot', () => ({
  WalletSlot: () => <div data-testid="wallet-slot-stub" />,
}));

vi.mock('@/components/home/AnnouncementBar', () => ({
  AnnouncementBar: () => null,
}));

vi.mock('@/lib/announcements', () => ({
  getActiveAnnouncement: () => null,
}));

describe('desktop and mobile shell', () => {
  it('renders desktop primary nav as top icons with labels', () => {
    render(<DesktopSidebar pathname="/" />);
    expect(screen.getByLabelText('Primary')).toBeTruthy();
    expect(screen.getByLabelText('SCOOP home')).toBeTruthy();
    expect(screen.getByText('Create').closest('a')).toBeTruthy();
    expect(screen.getByText('Home').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('News')).toBeTruthy();
    expect(screen.getByText('Markets')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
  });

  it('marks Markets active on /markets', () => {
    render(<DesktopSidebar pathname="/markets" />);
    expect(screen.getByText('Markets').closest('a')?.getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByText('Home').closest('a')?.getAttribute('aria-current')).toBeNull();
  });

  it('renders mobile bottom nav with square create and icon-only links', () => {
    render(<MobileBottomNav pathname="/news" />);
    expect(screen.getByLabelText('Mobile')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'News' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Create' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Markets' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Account' })).toBeTruthy();
    expect(screen.queryByText('News')).toBeNull();
  });

  it('mounts exactly one shared SiteFooter after page content', () => {
    render(
      <AppShell>
        <main data-testid="page-main">Token market</main>
      </AppShell>,
    );
    const footers = screen.getAllByTestId('site-footer');
    expect(footers).toHaveLength(1);
    expect(
      screen.getByTestId('page-main').compareDocumentPosition(footers[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/legal/terms');
  });
});
