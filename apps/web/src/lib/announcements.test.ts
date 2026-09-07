import { describe, expect, it } from 'vitest';
import {
  getActiveAnnouncement,
  type Announcement,
} from '@/lib/announcements';

const base: Announcement = {
  id: 't',
  label: 'Event',
  message: 'Hello',
  href: '/launch',
  enabled: true,
};

describe('getActiveAnnouncement', () => {
  it('returns the first enabled item in window', () => {
    const items: Announcement[] = [
      { ...base, id: 'off', enabled: false },
      { ...base, id: 'on', message: 'Live now' },
    ];
    expect(getActiveAnnouncement(items)?.id).toBe('on');
  });

  it('respects startsAt / endsAt', () => {
    const now = Date.parse('2026-09-07T12:00:00Z');
    const items: Announcement[] = [
      {
        ...base,
        id: 'future',
        startsAt: '2026-09-08T00:00:00Z',
      },
      {
        ...base,
        id: 'past',
        endsAt: '2026-09-01T00:00:00Z',
      },
      {
        ...base,
        id: 'current',
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2026-09-10T00:00:00Z',
      },
    ];
    expect(getActiveAnnouncement(items, now)?.id).toBe('current');
  });

  it('returns null when nothing is active', () => {
    expect(getActiveAnnouncement([{ ...base, enabled: false }])).toBeNull();
  });
});
