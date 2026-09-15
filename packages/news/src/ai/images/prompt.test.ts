import { describe, expect, it } from 'vitest';
import {
  assertSafeImagePrompt,
  buildTokenArtworkPrompt,
  IMAGE_SYSTEM_CONSTRAINTS,
} from './prompt.js';
import type { ConceptArticleContext, LaunchConcept } from '../types.js';

function concept(partial: Partial<LaunchConcept> & Pick<LaunchConcept, 'name' | 'ticker'>): LaunchConcept {
  return {
    id: 'concept_1',
    description: partial.description ?? 'Market-moving launch concept.',
    recommendedPairAddress: '0x0000000000000000000000000000000000000000',
    recommendedPairSymbol: partial.recommendedPairSymbol ?? 'ETH',
    pairRationale: 'Enabled quote.',
    imageDirection:
      partial.imageDirection ??
      'One bold mascot with a single focal metaphor for the token.',
    ...partial,
  };
}

function article(
  partial: Partial<ConceptArticleContext> & Pick<ConceptArticleContext, 'headline'>,
): ConceptArticleContext {
  return {
    providerArticleId: 'test-1',
    description: partial.description ?? null,
    sourceDomain: partial.sourceDomain ?? 'example.com',
    publishedAt: '2026-09-14T00:00:00Z',
    crawledAt: '2026-09-14T00:01:00Z',
    tickers: partial.tickers ?? [],
    tags: partial.tags ?? [],
    ...partial,
  };
}

describe('buildTokenArtworkPrompt', () => {
  it('inserts token name and ticker as context fields', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({ headline: 'Chip demand rises' }),
      concept: concept({
        name: 'Green Chip',
        ticker: 'gchip',
        imageDirection: 'A single green chip character as the avatar.',
      }),
      style: 'iconic',
    });
    expect(prompt).toContain('tokenName: Green Chip');
    expect(prompt).toContain('tokenTicker: GCHIP');
    assertSafeImagePrompt(prompt);
  });

  it('inserts story/company context and related stock tickers when available', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Nvidia lifts guidance after AI demand surge',
        description: 'Data-center GPUs drive outlook.',
        tickers: ['NVDA'],
        tags: ['ai', 'semiconductors'],
      }),
      concept: concept({
        name: 'Chip Rally',
        ticker: 'CHIP',
        recommendedPairSymbol: 'NVDA',
        imageDirection: 'One glowing GPU crystal as a simple token mascot.',
      }),
      style: 'editorial_abstract',
    });
    expect(prompt).toContain('relatedStockTickers: NVDA');
    expect(prompt).toContain('quotePairSymbol: NVDA');
    expect(prompt).toContain('themeTags: ai, semiconductors');
    expect(prompt).toContain('Nvidia lifts guidance');
    expect(prompt).toMatch(/token avatar|TOKEN AVATAR/i);
    expect(prompt).toMatch(/background context/i);
    expect(prompt).not.toMatch(/\+4\.8%/);
    expect(prompt).not.toMatch(/\$\d+\.\d{2}/);
  });

  it('handles missing optional context cleanly', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Fed signals rate path',
        description: null,
        tickers: [],
        tags: [],
      }),
      concept: concept({ name: 'Rate Watch', ticker: 'FEDW' }),
      style: 'iconic',
    });
    expect(prompt).toContain('relatedStockTickers: (none)');
    expect(prompt).toContain('themeTags: (none)');
    expect(prompt).toContain('shortContext: (none)');
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });

  it('requests token-avatar art and suppresses AI clichés + information design', () => {
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/Square 1:1/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/thumbnail|64×64|64x64/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/TOKEN AVATAR|token avatar/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/One concept\. One focal point/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/NO INFORMATION DESIGN|ticker boards|market terminals/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/Do NOT render the token name/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/glowing AI|floating crypto|cyberpunk neon/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/Do NOT invent factual prices/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).not.toMatch(
      /PRIORITY 2 — VISUAL LANGUAGE: Stock-exchange ticker board/i,
    );
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(
      /Do NOT create stock-exchange ticker boards/i,
    );
    const prompt = buildTokenArtworkPrompt({
      article: article({ headline: 'Crude inventory surprise' }),
      concept: concept({ name: 'Barrel Tape', ticker: 'OILT' }),
      style: 'memetic',
    });
    assertSafeImagePrompt(prompt);
  });

  it('does not hardcode example company tickers into unrelated prompts', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Coffee futures jump on frost fears',
        tickers: ['KC'],
        tags: ['commodities'],
      }),
      concept: concept({ name: 'Frost Bid', ticker: 'JAVA' }),
      style: 'iconic',
    });
    expect(prompt).toContain('relatedStockTickers: KC');
    expect(prompt).not.toContain('relatedStockTickers: NVDA');
    expect(prompt).not.toMatch(/\bNvidia\b/i);
  });

  it('A — company/AI stock story stays avatar metaphor, not terminal board', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'NVDA breaks out on AI capex',
        tickers: ['NVDA'],
        tags: ['ai'],
      }),
      concept: concept({
        name: 'Silicon Tape',
        ticker: 'SILI',
        recommendedPairSymbol: 'NVDA',
        imageDirection: 'One crystalline chip creature as the sole focal subject.',
      }),
      style: 'iconic',
    });
    expect(prompt).toMatch(/token avatar|TOKEN AVATAR/i);
    expect(prompt).toContain('relatedStockTickers: NVDA');
    expect(prompt).toContain('One crystalline chip creature');
    expect(prompt).toMatch(/Do NOT render the token name|do not render the token name/i);
    expect(prompt).toMatch(/ticker boards|market terminals|dashboards/i);
    expect(prompt).not.toMatch(/Oversized ticker|market-board mark as the hero/i);
    expect(prompt.indexOf('PRIORITY 1 — TOKEN AVATAR')).toBeLessThan(
      prompt.indexOf('creativeDirection:'),
    );
  });

  it('B — macro story stays metaphor avatar, not scoreboard', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Fed holds rates; markets reprice cuts',
        tickers: [],
        tags: ['rates', 'fed'],
      }),
      concept: concept({
        name: 'Cut Watch',
        ticker: 'CUTS',
        imageDirection: 'A single hawk and dove silhouette as one simple metaphor.',
      }),
      style: 'editorial_abstract',
    });
    expect(prompt).toMatch(/token avatar|TOKEN AVATAR|visual metaphor/i);
    expect(prompt).toContain('themeTags: rates, fed');
    expect(prompt).toMatch(/STYLE=EDITORIAL_ABSTRACT/);
    expect(prompt).not.toMatch(
      /Financial-newspaper \/ terminal-hybrid poster mood|story theme treated as market-data graphic/i,
    );
    expect(prompt).toMatch(/Not an editorial poster|simple avatar/i);
  });

  it('C — commodity/energy uses object metaphor without board treatment', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Energy majors beat on refining margins',
        tickers: ['XOM'],
        tags: ['oil', 'energy', 'earnings'],
      }),
      concept: concept({
        name: 'Margin Barrel',
        ticker: 'BRRL',
        recommendedPairSymbol: 'XOM',
        imageDirection: 'One oversized oil barrel character as the token avatar.',
      }),
      style: 'memetic',
    });
    expect(prompt).toContain('relatedStockTickers: XOM');
    expect(prompt).toContain('quotePairSymbol: XOM');
    expect(prompt).toMatch(/STYLE=MEMETIC/);
    expect(prompt).toMatch(/No meme collage|token-avatar/i);
    expect(prompt).not.toMatch(/scoreboard swagger|ticker\/terminal\/editorial graphic/i);
  });

  it('D — meme-ish concept stays single characterful avatar', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Meme stock chatter returns to tape',
        tickers: ['GME'],
        tags: ['meme'],
      }),
      concept: concept({
        name: 'Tape Rocket',
        ticker: 'YEET',
        imageDirection: 'One cartoon rocket mascot blasting upward; no text.',
      }),
      style: 'memetic',
    });
    expect(prompt).toContain('STYLE=MEMETIC');
    expect(prompt).toContain('tokenTicker: YEET');
    expect(prompt).toMatch(/do not render the token ticker|Do NOT render the token name/i);
    expect(prompt).not.toMatch(/trading-floor scoreboard|ticker culture/i);
  });

  it('iconic style no longer asks for oversized ticker/market-board typography', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({ headline: 'Any story' }),
      concept: concept({ name: 'Test', ticker: 'TEST' }),
      style: 'iconic',
    });
    expect(prompt).toContain('STYLE=ICONIC:');
    expect(prompt).toMatch(/One bold visual metaphor/i);
    expect(prompt).toMatch(/No typography or information-design/i);
    expect(prompt).not.toMatch(/Oversized ticker|market-board mark|exchange-display composition/i);
    expect(prompt).not.toMatch(/Compose a financial-market \/ ticker-board/i);
  });
});
