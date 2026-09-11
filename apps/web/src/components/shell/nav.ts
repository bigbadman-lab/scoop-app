export type NavItem = {
  id: 'discover' | 'markets' | 'news' | 'create' | 'account' | 'docs' | 'support';
  label: string;
  href: string;
};

export const PRIMARY_NAV: readonly NavItem[] = [
  { id: 'discover', label: 'Home', href: '/' },
  { id: 'markets', label: 'Markets', href: '/markets' },
  { id: 'news', label: 'News', href: '/news' },
  { id: 'create', label: 'Create', href: '/launch' },
  { id: 'account', label: 'Account', href: '/account' },
] as const;

export const SECONDARY_NAV: readonly NavItem[] = [
  { id: 'docs', label: 'Docs', href: '/docs' },
  { id: 'support', label: 'Support', href: '/support' },
] as const;

export const MOBILE_NAV: readonly NavItem[] = PRIMARY_NAV;

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
