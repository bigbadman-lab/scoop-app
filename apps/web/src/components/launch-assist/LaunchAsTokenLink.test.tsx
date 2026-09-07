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

  it('uses restrained feed styling without orange fill by default', () => {
    render(<LaunchAsTokenLink providerArticleId="77" variant="feed" />);
    const link = screen.getByRole('link', { name: /launch as token/i });
    expect(link.className).toContain('text-[var(--muted)]');
    expect(link.className).not.toContain('bg-[var(--scoop-orange)]');
  });
});
