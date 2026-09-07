import { describe, expect, it } from 'vitest';
import {
  displayFdv,
  formatCompactAge,
  formatProgressPercent,
  formatRelativeTime,
  truncateAddress,
} from '@/lib/format';

describe('format helpers', () => {
  it('truncates addresses', () => {
    expect(truncateAddress('0x71F1234567890abcdef82A')).toMatch(/^0x71F…82A$/);
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-09-07T12:00:00.000Z');
    expect(formatRelativeTime('2026-09-07T11:59:30.000Z', now)).toBe('30s ago');
    expect(formatRelativeTime('2026-09-07T11:00:00.000Z', now)).toBe('1h ago');
  });

  it('formats compact age and progress', () => {
    expect(formatCompactAge(125)).toBe('2m');
    expect(formatProgressPercent(7100)).toBe('71%');
  });

  it('never invents FDV', () => {
    expect(displayFdv(null)).toBeNull();
    expect(displayFdv('')).toBeNull();
    expect(displayFdv('  ')).toBeNull();
    expect(displayFdv('$42.8K')).toBe('$42.8K');
  });
});
