import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesktopSidebar } from '@/components/shell/DesktopSidebar';
import { MobileBottomNav } from '@/components/shell/MobileBottomNav';

vi.mock('next/image', () => ({
  default: ({ alt, priority: _priority, ...props }: { alt: string; priority?: boolean }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img alt={alt} {...props} />;
  },
}));

describe('desktop and mobile shell', () => {
  it('renders desktop primary nav as top icons with labels', () => {
    render(<DesktopSidebar pathname="/" />);
    expect(screen.getByLabelText('Primary')).toBeTruthy();
    expect(screen.getByLabelText('SCOOP home')).toBeTruthy();
    expect(screen.getByText('Create').closest('a')).toBeTruthy();
    expect(screen.getByText('Home').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('News')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
  });

  it('renders mobile bottom nav with square create and labels', () => {
    render(<MobileBottomNav pathname="/news" />);
    expect(screen.getByLabelText('Mobile')).toBeTruthy();
    expect(screen.getByText('News').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Create').closest('a')).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
  });
});
