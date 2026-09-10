import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LaunchAsTokenLink } from '@/components/launch-assist/LaunchAsTokenLink';

describe('LaunchAsTokenLink', () => {
  it('links to /news/{providerArticleId}/launch with encoded id only', () => {
    render(<LaunchAsTokenLink providerArticleId="abc/123" />);
    const link = screen.getByRole('link', { name: /launch as token/i });
    expect(link.getAttribute('href')).toBe('/news/abc%2F123/launch');
  });

  it('returns null for empty id', () => {
    const { container } = render(<LaunchAsTokenLink providerArticleId="  " />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('uses compact orange feed CTA styling', () => {
    render(<LaunchAsTokenLink providerArticleId="77" variant="feed" />);
    const link = screen.getByRole('link', { name: /launch as token/i });
    expect(link.className).toContain('bg-[var(--scoop-orange)]');
    expect(link.className).toContain('min-h-8');
  });

  it('uses compact orange another-market CTA styling', () => {
    render(<LaunchAsTokenLink providerArticleId="77" variant="another" />);
    const link = screen.getByRole('link', { name: /launch another market/i });
    expect(link.getAttribute('href')).toBe('/news/77/launch');
    expect(link.className).toContain('bg-[var(--scoop-orange)]');
  });
});
