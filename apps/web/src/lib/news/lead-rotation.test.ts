import { describe, expect, it } from 'vitest';
import {
  NEWS_LEAD_ROTATION_COUNT,
  NEWS_LEAD_ROTATION_MS,
  leadArticleIndex,
  leadPoolSignature,
  nextLeadArticleId,
  reconcileLeadArticleId,
  shouldRotateNewsLead,
  splitNewsLeadFeed,
} from '@/lib/news/lead-rotation';

describe('news lead rotation helpers', () => {
  it('uses an 8s interval and top-5 pool', () => {
    expect(NEWS_LEAD_ROTATION_MS).toBe(8_000);
    expect(NEWS_LEAD_ROTATION_COUNT).toBe(5);
  });

  it('splits lead pool from a stable static feed', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((id) => ({ id }));
    expect(splitNewsLeadFeed(items)).toEqual({
      leadPool: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }],
      staticFeed: [{ id: 'F' }, { id: 'G' }],
    });
    expect(splitNewsLeadFeed(items.slice(0, 3)).staticFeed).toEqual([]);
  });

  it('reconciles active id across pool changes', () => {
    const pool = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(reconcileLeadArticleId(pool, 'B')).toBe('B');
    expect(reconcileLeadArticleId(pool, 'Z')).toBe('A');
    expect(reconcileLeadArticleId([], 'A')).toBeNull();
  });

  it('advances by stable identity', () => {
    const pool = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    expect(nextLeadArticleId(pool, 'A')).toBe('B');
    expect(nextLeadArticleId(pool, 'C')).toBe('A');
    expect(nextLeadArticleId([{ id: 'A' }], 'A')).toBe('A');
    expect(shouldRotateNewsLead(1)).toBe(false);
    expect(shouldRotateNewsLead(2)).toBe(true);
    expect(leadArticleIndex(pool, 'C')).toBe(2);
    expect(leadPoolSignature(pool)).toBe('A|B|C');
  });
});
