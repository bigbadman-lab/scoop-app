import Link from 'next/link';
import {
  getActiveAnnouncement,
  type Announcement,
} from '@/lib/announcements';

type Props = {
  announcement?: Announcement | null;
};

export function AnnouncementBar({ announcement }: Props) {
  const item = announcement === undefined ? getActiveAnnouncement() : announcement;
  if (!item) return null;

  const inner = (
    <span className="mx-auto flex w-full max-w-[1400px] items-center justify-center gap-2.5 px-4 text-center sm:gap-3 md:px-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--scoop-orange-contrast)]/75">
        {item.label}
      </span>
      <span className="text-[var(--scoop-orange-contrast)]/40" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate text-[13px] tracking-tight text-[var(--scoop-orange-contrast)] md:text-[14px]">
        {item.message}
      </span>
      <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)] sm:inline">
        View →
      </span>
    </span>
  );

  const className =
    'flex h-[var(--announcement-height)] w-full items-center bg-[var(--scoop-orange)] transition-opacity hover:opacity-95';

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`${item.label}: ${item.message}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      href={item.href}
      className={className}
      aria-label={`${item.label}: ${item.message}`}
    >
      {inner}
    </Link>
  );
}
