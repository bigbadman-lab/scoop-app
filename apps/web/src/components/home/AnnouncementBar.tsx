import Image from 'next/image';
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

  const ariaLabel =
    item.label.trim().length > 0 ? `${item.label}: ${item.message}` : item.message;

  const inner = item.imageSrc ? (
    <span className="mx-auto flex w-full max-w-[1400px] items-center justify-center gap-2 px-4 text-center sm:gap-2.5 md:px-8">
      <Image
        src={item.imageSrc}
        alt=""
        width={160}
        height={80}
        className="h-[24px] w-auto shrink-0 object-contain sm:h-[26px]"
        sizes="80px"
        priority
      />
      <span className="min-w-0 truncate text-[12px] tracking-tight text-white underline-offset-4 transition-[text-decoration-color] group-hover:underline group-focus-visible:underline sm:text-[13px] md:text-[14px]">
        {item.message}
      </span>
    </span>
  ) : (
    <span className="mx-auto flex w-full max-w-[1400px] items-center justify-center gap-2.5 px-4 text-center sm:gap-3 md:px-8">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/75">
        {item.label}
      </span>
      <span className="text-white/40" aria-hidden>
        ·
      </span>
      <span className="min-w-0 truncate text-[13px] tracking-tight text-white md:text-[14px]">
        {item.message}
      </span>
      <span className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-white sm:inline">
        View →
      </span>
    </span>
  );

  const className =
    'group flex h-[var(--announcement-height)] w-full items-center bg-black transition-opacity hover:opacity-95 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white motion-reduce:transition-none';

  if (item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={ariaLabel}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={item.href} className={className} aria-label={ariaLabel}>
      {inner}
    </Link>
  );
}
