import { describe, expect, it } from 'vitest';
import {
  extractProtocolDocsSections,
  isEthereumAddress,
  loadProtocolDocsMarkdown,
  protocolDocsSectionId,
  resolveDocsResourceHref,
  resolveProtocolDocsPath,
} from '@/lib/docs/protocol-docs';

describe('protocol docs source', () => {
  it('resolves and loads the canonical Markdown from the monorepo root', () => {
    const path = resolveProtocolDocsPath();
    expect(path.endsWith('scoop-protocol-docs.md')).toBe(true);
    const markdown = loadProtocolDocsMarkdown();
    expect(markdown).toContain(
      'SCOOP turns what the market is talking about into markets people can trade.',
    );
    expect(markdown).toContain('0x4B227d5E6199f42ceA4e638875fF8C740757DD3C');
    expect(markdown).toContain('Protocol capability');
    expect(markdown).toContain('Current interface capability');
    expect(markdown).toContain('Protocol Vault');
    expect(markdown).not.toMatch(/buyback/i);
  });

  it('extracts all 24 numbered major sections with stable anchors', () => {
    const sections = extractProtocolDocsSections(loadProtocolDocsMarkdown());
    expect(sections).toHaveLength(24);
    expect(sections[0]).toMatchObject({
      number: 1,
      title: 'Protocol Overview',
      id: '1-protocol-overview',
    });
    expect(sections[21]).toMatchObject({
      number: 22,
      title: 'Risk Disclosure & Disclaimer',
      id: '22-risk-disclosure-and-disclaimer',
    });
    expect(sections[22]).toMatchObject({
      number: 23,
      title: 'Solana / Pump.fun Launches',
      id: '23-solana-pump-fun-launches',
    });
    expect(sections[23]).toMatchObject({
      number: 24,
      title: 'Creator Rewards Power Stronger Markets',
      id: '24-creator-rewards-power-stronger-markets',
    });
    expect(sections.map((s) => s.id)).toEqual([
      '1-protocol-overview',
      '2-how-scoop-works',
      '3-launching-a-market',
      '4-market-economics',
      '5-creator-identity',
      '6-holder-rewards',
      '7-quote-assets-and-stock-pairing',
      '8-price-oracle',
      '9-trading-and-liquidity',
      '10-protocol-architecture',
      '11-canonical-deployment',
      '12-protocol-contracts',
      '13-authorities-and-recipients',
      '14-indexer-and-market-data',
      '15-api',
      '16-protocol-events',
      '17-build-on-scoop',
      '18-security-and-administrative-boundaries',
      '19-developer-resources',
      '20-protocol-design-principles',
      '21-current-implementation-notes',
      '22-risk-disclosure-and-disclaimer',
      '23-solana-pump-fun-launches',
      '24-creator-rewards-power-stronger-markets',
    ]);
  });

  it('marks legacy SCOOP-native fee economics historical and keeps creator-reward model current', () => {
    const markdown = loadProtocolDocsMarkdown();
    expect(markdown).toContain('Historical protocol documentation');
    expect(markdown).toContain('Creator Rewards Power Stronger Markets');
    expect(markdown).toContain('selective rather than guaranteed');
    expect(markdown).toContain('Axiom');
    expect(markdown).toContain('GMGN');
    expect(markdown).not.toMatch(/Trade on Pump\.fun/);
    // Legacy split retained only under historical labelling
    expect(markdown).toMatch(/70% Creator/);
    expect(markdown).toMatch(/is \*\*not\*\* the current dual-rail product economics/);
  });

  it('builds deterministic section ids', () => {
    expect(protocolDocsSectionId(7, 'Quote Assets & Stock Pairing')).toBe(
      '7-quote-assets-and-stock-pairing',
    );
  });

  it('recognises Ethereum addresses and confirmed resource hrefs', () => {
    expect(isEthereumAddress('0x4B227d5E6199f42ceA4e638875fF8C740757DD3C')).toBe(true);
    expect(isEthereumAddress('not-an-address')).toBe(false);
    expect(resolveDocsResourceHref('github.com/bigbadman-lab/scoop-protocol')).toBe(
      'https://github.com/bigbadman-lab/scoop-protocol',
    );
    expect(resolveDocsResourceHref('https://scoop.fun/api/...')).toBe(
      'https://scoop.fun/api/',
    );
    expect(resolveDocsResourceHref('random.example')).toBeNull();
  });
});
