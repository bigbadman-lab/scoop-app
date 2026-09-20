import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: (props: { href: string; children?: unknown }) => (
    <a href={props.href}>{props.children as never}</a>
  ),
}));

import { TokenFreshLaunchGate } from '@/components/token/TokenFreshLaunchGate';

afterEach(() => cleanup());

describe('min render', () => {
  it('unknown shows friendly refresh copy without 404', async () => {
    render(
      <TokenFreshLaunchGate address="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" />,
    );
    const root = await screen.findByTestId('token-market-not-found');
    expect(root.textContent).toMatch(/Market still loading…/);
    expect(root.textContent).toMatch(
      /This market may still be syncing\. Refresh the page in a few seconds\./,
    );
    expect(root.textContent).not.toMatch(/404/);
    expect(root.textContent).not.toMatch(/Market not found/);
    expect(screen.getByTestId('token-unknown-refresh').textContent).toMatch(/Refresh page/);
    expect(screen.getByRole('link', { name: /Back to home/i }).getAttribute('href')).toBe(
      '/',
    );
  });
});
