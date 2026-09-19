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

describe('AnnouncementBar — $TAPE promotion removed', () => {
  it('has no active announcement and does not link to /protocol/tape', () => {
    expect(getActiveAnnouncement()).toBeNull();
    expect(ANNOUNCEMENTS.some((item) => item.href === '/protocol/tape')).toBe(false);
    expect(ANNOUNCEMENTS.some((item) => /\$TAPE/i.test(item.message))).toBe(false);
  });

  it('renders nothing when no announcement is active', () => {
    const { container } = render(<AnnouncementBar />);
    expect(container.textContent).not.toMatch(/\$TAPE/);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not show the old news-desk or launch-desk announcement copy', () => {
    render(<AnnouncementBar />);
    expect(screen.queryByText(/LIVE NEWS DESK/i)).toBeNull();
    expect(screen.queryByText(/Launch desk is live/i)).toBeNull();
    expect(screen.queryByText(/^New$/)).toBeNull();
  });
});
