/**
 * Global announcement bar entries (AppShell).
 * Enable one (or more) events here — the bar shows the first currently active item.
 */

export type Announcement = {
  id: string;
  /** Short mono eyebrow, e.g. "Event" or "Now". Optional when image + full message is used. */
  label: string;
  /** Main line shown in the bar. */
  message: string;
  href: string;
  /** Optional leading marker image (public path), e.g. `/house/live.png`. */
  imageSrc?: string;
  /** Open in a new tab when true. */
  external?: boolean;
  enabled: boolean;
  /** ISO timestamps — optional schedule window. */
  startsAt?: string;
  endsAt?: string;
};

/**
 * No active banner. The previous entry promoted `/protocol/tape` ($TAPE).
 * That route stays reachable by direct URL; it is not linked from the shell.
 */
export const ANNOUNCEMENTS: readonly Announcement[] = [];

function inWindow(item: Announcement, now: number): boolean {
  if (item.startsAt) {
    const start = Date.parse(item.startsAt);
    if (Number.isFinite(start) && now < start) return false;
  }
  if (item.endsAt) {
    const end = Date.parse(item.endsAt);
    if (Number.isFinite(end) && now > end) return false;
  }
  return true;
}

export function getActiveAnnouncement(
  items: readonly Announcement[] = ANNOUNCEMENTS,
  now = Date.now(),
): Announcement | null {
  return items.find((item) => item.enabled && inWindow(item, now)) ?? null;
}
