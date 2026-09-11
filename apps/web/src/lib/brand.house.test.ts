import { describe, expect, it } from 'vitest';
import { HOUSE_IMAGE_SET, HOUSE_IMAGE_ROTATE_MS } from '@/lib/brand';

describe('HOUSE_IMAGE_SET', () => {
  it('configures a single production house cover', () => {
    expect(HOUSE_IMAGE_SET).toEqual(['/house/place4.webp']);
    expect(HOUSE_IMAGE_SET.length).toBe(1);
    expect(HOUSE_IMAGE_ROTATE_MS).toBe(10_000);
  });
});
