import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteFooter } from '@/components/shell/SiteFooter';

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

describe('SiteFooter', () => {
  it('renders semantic footer with product and legal links', () => {
    render(<SiteFooter />);
    const footer = screen.getByTestId('site-footer');
    expect(footer.tagName).toBe('FOOTER');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'Markets' }).getAttribute('href')).toBe('/markets');
    expect(screen.getByRole('link', { name: 'News' }).getAttribute('href')).toBe('/news');
    expect(screen.getByRole('link', { name: 'Launch' }).getAttribute('href')).toBe('/launch');
    expect(screen.getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account');
    expect(screen.getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/legal/terms');
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe(
      '/legal/privacy',
    );
    expect(screen.getByText(/Markets for what’s happening now/i)).toBeTruthy();
    expect(screen.getAllByLabelText('SCOOP on X').length).toBeGreaterThanOrEqual(1);
  });
});
