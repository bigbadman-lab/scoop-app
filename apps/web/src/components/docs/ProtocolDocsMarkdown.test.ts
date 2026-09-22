/**
 * Node-safe render checks (jsdom is currently broken on the project's Node 20
 * due to undici/CacheStorage). Uses react-dom/server instead of Testing Library.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ProtocolDocsMarkdown } from '@/components/docs/ProtocolDocsMarkdown';
import { ProtocolDocsNav } from '@/components/docs/ProtocolDocsNav';
import {
  extractProtocolDocsSections,
  loadProtocolDocsMarkdown,
} from '@/lib/docs/protocol-docs';

describe('ProtocolDocsMarkdown', () => {
  it('renders canonical Factory address and major section anchors', () => {
    const markdown = loadProtocolDocsMarkdown();
    const html = renderToStaticMarkup(
      createElement(ProtocolDocsMarkdown, { markdown }),
    );

    expect(html).toContain(
      'SCOOP turns what the market is talking about into markets people can trade.',
    );
    expect(html).toContain('0x4B227d5E6199f42ceA4e638875fF8C740757DD3C');
    expect(html).toContain('id="1-protocol-overview"');
    expect(html).toContain('id="11-canonical-deployment"');
    expect(html).toContain('id="22-risk-disclosure-and-disclaimer"');
    expect(html).toContain('id="24-creator-rewards-power-stronger-markets"');
    expect(html).toContain('data-testid="protocol-docs-content"');
    expect(html).toContain('data-testid="docs-creator-rewards-flywheel"');
    expect(html).toContain('Protocol Vault');
    expect(html).toContain('Protocol capability');
    expect(html).toContain('Current interface capability');
    expect(html).toContain('https://github.com/bigbadman-lab/scoop-protocol');
    expect(html).toContain('https://scoop.fun/api/');
  });
});

describe('ProtocolDocsNav', () => {
  it('links every extracted major section', () => {
    const sections = extractProtocolDocsSections(loadProtocolDocsMarkdown());
    const html = renderToStaticMarkup(createElement(ProtocolDocsNav, { sections }));

    expect(sections).toHaveLength(24);
    for (const section of sections) {
      expect(html).toContain(`href="#${section.id}"`);
    }
  });
});
