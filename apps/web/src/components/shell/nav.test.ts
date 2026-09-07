import { describe, expect, it } from 'vitest';
import { isNavActive, MOBILE_NAV, PRIMARY_NAV } from '@/components/shell/nav';

describe('shell navigation', () => {
  it('exposes desktop primary destinations', () => {
    expect(PRIMARY_NAV.map((n) => n.id)).toEqual([
      'discover',
      'news',
      'create',
      'account',
    ]);
  });

  it('mobile nav mirrors Home · News · Create · Account', () => {
    expect(MOBILE_NAV.map((n) => n.label)).toEqual([
      'Home',
      'News',
      'Create',
      'Account',
    ]);
  });

  it('marks active routes without treating all paths as home', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/news', '/')).toBe(false);
    expect(isNavActive('/news', '/news')).toBe(true);
    expect(isNavActive('/token/0xabc', '/token')).toBe(true);
  });
});
