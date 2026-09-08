import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementBar } from '@/components/home/AnnouncementBar';
import { ANNOUNCEMENTS, getActiveAnnouncement } from '@/lib/announcements';

vi.mock('next/image', () => ({
  default: (props: {
    alt: string;
    src: string;
    width?: number;
    height?: number;
    className?: string;
    priority?: boolean;
  }) => {
    const { priority: _p, ...rest } = props;
    void _p;
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-src={props.src} alt={props.alt} className={props.className} {...rest} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('AnnouncementBar — live news desk', () => {
  it('activates the live news desk announcement by default', () => {
    const active = getActiveAnnouncement();
    expect(active?.id).toBe('live-news-desk');
    expect(active?.href).toBe('/news');
    expect(active?.imageSrc).toBe('/house/live.png');
    expect(active?.message).toBe(
      'LIVE NEWS DESK — Stock-moving stories, as they break →',
    );
    expect(ANNOUNCEMENTS.some((a) => a.id === 'welcome-launch-desk')).toBe(false);
  });

  it('renders exact copy, decorative live.png, and whole-bar /news link', () => {
    render(<AnnouncementBar />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/news');
    expect(
      screen.getByText('LIVE NEWS DESK — Stock-moving stories, as they break →'),
    ).toBeTruthy();
    const img = document.querySelector('img[data-src="/house/live.png"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('alt')).toBe('');
    expect(img.closest('a')?.getAttribute('href')).toBe('/news');
  });

  it('does not show the old launch-desk announcement copy', () => {
    render(<AnnouncementBar />);
    expect(screen.queryByText(/Launch desk is live/i)).toBeNull();
    expect(screen.queryByText(/^New$/)).toBeNull();
  });

  it('keeps the entire bar keyboard-focusable as one link', () => {
    render(<AnnouncementBar />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('aria-label')).toMatch(/LIVE NEWS DESK/i);
    expect(link.className).toMatch(/focus-visible:outline/);
  });
});
