/**
 * Node-safe render check (jsdom CacheStorage issues on Node 20).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CreatorRewardsFlywheel } from '@/components/docs/CreatorRewardsFlywheel';

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) =>
    createElement('img', { alt: props.alt, src: props.src }),
}));

describe('CreatorRewardsFlywheel', () => {
  it('renders flywheel steps and marketfeeds artwork', () => {
    const html = renderToStaticMarkup(createElement(CreatorRewardsFlywheel));

    expect(html).toContain('data-testid="docs-creator-rewards-flywheel"');
    expect(html).toContain('/brand/marketfeeds.webp');
    expect(html).toContain('Earn');
    expect(html).toContain('Scan');
    expect(html).toContain('Buy');
    expect(html).toContain('Compound');
    expect(html).toContain('$TAPE');
    expect(html.match(/data-testid="docs-flywheel-step"/g)?.length).toBe(4);
  });
});
