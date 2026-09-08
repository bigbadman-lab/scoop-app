import { describe, expect, it } from 'vitest';
import {
  evaluateScoopNewsRelevance,
  filterEquityTickers,
} from './relevance.js';

describe('filterEquityTickers', () => {
  it('drops noise tickers and normalizes case', () => {
    expect(filterEquityTickers(['aapl', 'AI', 'msft', 'IMF', 'SDK', 'USA', 'aapl'])).toEqual([
      'AAPL',
      'MSFT',
    ]);
  });
});

describe('evaluateScoopNewsRelevance — accepts', () => {
  it('accepts listed-company earnings', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Apple reports quarterly earnings above estimates',
      description: 'AAPL raised guidance for the next quarter.',
      tickers: ['AAPL'],
    });
    expect(r.accepted).toBe(true);
    expect(r.relevanceClass).toBe('company');
    expect(r.reasons).toContain('equity_event');
  });

  it('accepts M&A with ticker', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Oracle to acquire software firm in $2B deal',
      tickers: ['ORCL'],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('equity_event');
  });

  it('accepts Synopsys analyst upgrade', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Morgan Stanley Upgrades Synopsys (SNPS) Stock to Overweight With $500 Price Target',
      tickers: ['SNPS', 'MS'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Intel catalyst / price move', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Intel Climbs 5% on High-NA EUV Production Lead, ASML and Taiwan Semiconductor Advance 3%',
      tickers: ['INTC', 'ASML', 'TSM'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Glencore material corporate event', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Glencore: With Consolidation Off The Table, Is Marketing Muscle Still The Group\'s Defining Edge?',
      description: 'The miner abandoned merger talks and faces restructuring of its marketing division.',
      tickers: ['GLNCY'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts pharma tariff impact', () => {
    const r = evaluateScoopNewsRelevance({
      title: "Patients pay the tariff: Swiss pharma CEO warns of Trump's generic drug tariff threat",
      tickers: ['NVO', 'NVS'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts M&A / merger investigation', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'INVESTOR ALERT: The M&A Class Action Firm Launches Investigation of the Merger - AUUD, TECH, CZR and CBAN',
      tickers: ['AUUD', 'TECH', 'CZR', 'CBAN'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts guidance', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Microsoft raises guidance after strong quarter',
      tickers: ['MSFT'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts SEC action', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'SEC charges fintech lender over disclosure failures',
      tickers: ['SOFI'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts buyback/dividend', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Greggs announces dividend timetable and trading update',
      tickers: ['GRG'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts material contract', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Lockheed wins major contract for missile defense systems',
      tickers: ['LMT'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts macro-equity Fed story', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Federal Reserve signals slower path for interest rate cuts',
      description: 'Wall Street stocks reacted as treasury yields moved.',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.relevanceClass).toBe('macro_equity');
  });

  // D.2 Stock News API keepers
  it('accepts IONQ revised outlook', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'IonQ Revises Full-Year Outlook After Stronger Quantum Bookings',
      tickers: ['IONQ'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Qualcomm Amazon AI silicon deal', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Qualcomm and Amazon Expand AI Silicon Deal for Custom Chips',
      tickers: ['QCOM', 'AMZN'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Nebius Palantir partnership', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Nebius Announces Partnership With Palantir for AI Infrastructure',
      tickers: ['NBIS', 'PLTR'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Novartis trial setback', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Novartis Faces Pipeline Setbacks After Late-Stage Trial Miss',
      tickers: ['NVS'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts Roivant clinical data', () => {
    const r = evaluateScoopNewsRelevance({
      title: "Roivant's Candidate Shows Robust Data in Phase 2 Clinical Trial",
      tickers: ['ROIV'],
    });
    expect(r.accepted).toBe(true);
  });

  it('accepts NextEra DOE loan', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'NextEra Energy Secures DOE Loan for Grid Expansion Project',
      tickers: ['NEE'],
    });
    expect(r.accepted).toBe(true);
  });
});

describe('evaluateScoopNewsRelevance — D.1a failure regressions', () => {
  it('rejects ticker alone without equity event', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Wearable Devices Introduces Neural Sensing Layer for Physical AI',
      tickers: ['WLDS'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('no_equity_event');
  });

  it('rejects MANU Champions League', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Como executives to give up seats to elderly fans for Champions League debut',
      tickers: ['MANU'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('sports');
  });

  it('rejects NTDOY RPG', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Xuan-Yuan Sword Creator Announces Tianji, Tang Dynasty RPG With Four Hits Per Turn',
      tickers: ['NTDOY'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('gaming_entertainment');
  });

  it('rejects NTDOY Street Fighter', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Street Fighter 6 Gets Second Indian Fighter Arjun on October 13',
      tickers: ['NTDOY'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('gaming_entertainment');
  });

  it('rejects NFLX Matrix/Lilly Wachowski', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Lilly Wachowski Says She Is Done With Matrix as Simulation Science Escalates',
      tickers: ['NFLX'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('gaming_entertainment');
  });

  it('rejects RDFN realtor promo', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Best Realtor in Huntington Beach, CA: Robert van der Goes',
      tickers: ['RDFN', 'Z', 'CA'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('consumer_lifestyle');
  });

  it('rejects BARK Girl Scouts cookies', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Girl Scouts of the USA Debuts Patch Pals, Its First Dog Cookie',
      tickers: ['BARK', 'USA'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('consumer_lifestyle');
  });

  it('rejects TM/Suzuki lifestyle vehicle story', () => {
    const r = evaluateScoopNewsRelevance({
      title: "Suzuki's Decade-Old $6,500 Hatch Loses A Cylinder To Chase Mileage",
      tickers: ['TM'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons.some((x) => x === 'consumer_lifestyle' || x === 'no_equity_event')).toBe(
      true,
    );
  });

  it('rejects pickup truck redesigns', () => {
    const r = evaluateScoopNewsRelevance({
      title: '6 Pickup Truck Redesigns That Totally Missed The Mark',
      tickers: ['NSANY', 'TM'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('consumer_lifestyle');
  });

  it('rejects generic SDK product PR', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Telit Cinterion Introduces Edge AI SDK to Run Machine Learning Models',
      tickers: ['SDK'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons.some((x) => x === 'generic_pr' || x === 'ambiguous_ticker' || x === 'no_equity_event')).toBe(
      true,
    );
  });

  it('rejects maternal health grant PR', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Fidelis Care Opens Here for Your Health Maternal Health Grant Applications',
      tickers: ['CNC'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('generic_pr');
  });

  it('rejects price-action / algorithmic-entry article', () => {
    const r = evaluateScoopNewsRelevance({
      title: '(NKE) Movement Within Algorithmic Entry Frameworks',
      tickers: ['NKE'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('algo_trading_spam');
  });

  it('rejects Crossing A Market Line spam', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Is NL Industries (NYSE:NL) Crossing A Market Line?',
      tickers: ['NL'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('algo_trading_spam');
  });

  it('rejects crypto-only without equity', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Bitcoin rallies as crypto traders chase memecoins',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('crypto_only');
  });

  it('rejects Form 8.3 noise', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Form 8.3',
      tickers: ['XYZ'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('form_83');
  });

  it('rejects peer comparison spam', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Contrasting eBay (NASDAQ:EBAY) & Kohl’s (NYSE:KSS)',
      tickers: ['EBAY', 'KSS'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('peer_comparison_spam');
  });

  it('rejects conference PR without material event', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Acme Corp announces participation in Goldman investor conference',
      tickers: ['ACME'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('conference_pr');
  });

  // D.2 Stock News API soft-quality rejects
  it('rejects Zacks trending stock facts', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Zacks.com featured highlights today for Trending Stock: Facts to Know Before Betting',
      tickers: ['XYZ'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('soft_opinion');
  });

  it('rejects SueWallSt lawsuit mill', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'SueWallSt Reminds Shareholders of a Lead Plaintiff Deadline',
      tickers: ['ACME'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('lawsuit_solicitation');
  });

  it('rejects ETF commentary', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Leveraged ETF Areas of Last Week: Contributors and Detractors',
      tickers: ['SPY'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons.some((x) => x === 'etf_commentary' || x === 'soft_opinion')).toBe(true);
  });

  it('rejects smarter-bet peer filler', () => {
    const r = evaluateScoopNewsRelevance({
      title: 'Forget NVDA: This AI Hardware Stock Is the Smarter Bet Right Now',
      tickers: ['NVDA'],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons).toContain('soft_opinion');
  });
});
