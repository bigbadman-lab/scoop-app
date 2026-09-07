import { describe, expect, it } from 'vitest';
import { HOUSE_IMAGE_SET, HOUSE_IMAGE_ROTATE_MS } from '@/lib/brand';

describe('HOUSE_IMAGE_SET', () => {
  it('is the ordered source of truth and supports up to 3 assets', () => {
    expect(Array.isArray(HOUSE_IMAGE_SET)).toBe(true);
    expect(HOUSE_IMAGE_SET.length).toBeLessThanOrEqual(3);
    expect(HOUSE_IMAGE_ROTATE_MS).toBe(10_000);
  });
});
