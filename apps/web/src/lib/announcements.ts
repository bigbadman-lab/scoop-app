/**
 * Homepage announcement bar entries.
 * Enable one (or more) events here — the bar shows the first currently active item.
 */

export type Announcement = {
  id: string;
  /** Short mono eyebrow, e.g. "Event" or "Now". */
  label: string;
  /** Main line shown in the bar. */
  message: string;
  href: string;
  /** Open in a new tab when true. */
  external?: boolean;
  enabled: boolean;
  /** ISO timestamps — optional schedule window. */
  startsAt?: string;
  endsAt?: string;
};

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: 'welcome-launch-desk',
    label: 'New',
    message: 'Launch desk is live — turn news into a market.',
    href: '/launch',
    enabled: true,
  },
];

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
