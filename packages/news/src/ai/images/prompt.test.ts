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
    imageDirection: partial.imageDirection ?? 'Market board treatment of the story.',
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
  it('inserts token name and ticker', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({ headline: 'Chip demand rises' }),
      concept: concept({ name: 'Green Chip', ticker: 'gchip', imageDirection: 'Board graphic' }),
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
        imageDirection: 'Let NVDA dominate like a market-board headline; chips secondary.',
      }),
      style: 'editorial_abstract',
    });
    expect(prompt).toContain('relatedStockTickers: NVDA');
    expect(prompt).toContain('quotePairSymbol: NVDA');
    expect(prompt).toContain('themeTags: ai, semiconductors');
    expect(prompt).toContain('Nvidia lifts guidance');
    expect(prompt).toMatch(/stock-exchange ticker board|market terminal/i);
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

  it('requests square/thumbnail-friendly market editorial art and suppresses AI clichés', () => {
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/Square 1:1/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/thumbnail/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/glowing AI|floating crypto|cyberpunk neon/i);
    expect(IMAGE_SYSTEM_CONSTRAINTS).toMatch(/Do NOT invent factual prices/i);
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

  it('A — company/AI stock story prioritizes market/ticker language', () => {
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
        imageDirection: 'Exchange board with NVDA as hero typography; chip motif secondary only.',
      }),
      style: 'iconic',
    });
    expect(prompt).toMatch(/ticker board|market terminal|ticker tape/i);
    expect(prompt).toContain('relatedStockTickers: NVDA');
    expect(prompt).toContain('Exchange board with NVDA as hero typography');
    // Market language is in the system block which leads the prompt.
    expect(prompt.indexOf('PRIORITY 2 — VISUAL LANGUAGE')).toBeLessThan(
      prompt.indexOf('creativeDirection:'),
    );
  });

  it('B — macro story stays board/editorial, not civic monument', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Fed holds rates; markets reprice cuts',
        tickers: [],
        tags: ['rates', 'fed'],
      }),
      concept: concept({
        name: 'Cut Watch',
        ticker: 'CUTS',
        imageDirection: 'Rate-decision market scoreboard; avoid marble government buildings.',
      }),
      style: 'editorial_abstract',
    });
    expect(prompt).toMatch(/financial-newspaper|terminal|scoreboard|ticker/i);
    expect(prompt).toContain('themeTags: rates, fed');
  });

  it('C — commodity/energy combines subject with exchange treatment', () => {
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
        imageDirection: 'Oil/energy subject as market graphic with XOM board treatment.',
      }),
      style: 'memetic',
    });
    expect(prompt).toContain('relatedStockTickers: XOM');
    expect(prompt).toContain('quotePairSymbol: XOM');
    expect(prompt).toMatch(/exchange|ticker|terminal|market/i);
  });

  it('D — meme-ish concept stays market culture', () => {
    const prompt = buildTokenArtworkPrompt({
      article: article({
        headline: 'Meme stock chatter returns to tape',
        tickers: ['GME'],
        tags: ['meme'],
      }),
      concept: concept({
        name: 'Tape Rocket',
        ticker: 'YEET',
        imageDirection: 'Playful trading-floor scoreboard swagger; still ticker culture.',
      }),
      style: 'memetic',
    });
    expect(prompt).toContain('STYLE=MEMETIC');
    expect(prompt).toMatch(/market-culture|trading-floor|scoreboard|ticker/i);
    expect(prompt).toContain('tokenTicker: YEET');
  });
});
