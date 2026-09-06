export type QuoteType = 'native' | 'stablecoin' | 'stock_token' | 'erc20';

export type EnabledQuoteAsset = {
  address: string;
  symbol: string;
  quoteType: QuoteType;
  decimals: number;
  chainId: number;
};

export type GenerateLaunchConceptsInput = {
  providerArticleId: string;
};

export type ConceptArticleContext = {
  providerArticleId: string;
  headline: string;
  description: string | null;
  sourceDomain: string;
  publishedAt: string;
  crawledAt: string;
  tickers: string[];
  tags: string[];
};

export type LaunchConceptId = 'concept_1' | 'concept_2' | 'concept_3';

export type LaunchConcept = {
  id: LaunchConceptId;
  name: string;
  ticker: string;
  description: string;
  recommendedPairAddress: string;
  recommendedPairSymbol: string;
  pairRationale: string;
  imageDirection: string;
};

export type LaunchConceptResponse = {
  article: {
    providerArticleId: string;
    headline: string;
  };
  concepts: [LaunchConcept, LaunchConcept, LaunchConcept];
};

export type ConceptGenerationUsage = {
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  repairAttempted: boolean;
};

export type GenerateLaunchConceptsResult = {
  response: LaunchConceptResponse;
  usage: ConceptGenerationUsage;
  enabledQuotes: EnabledQuoteAsset[];
};
