import type { EnabledQuoteAsset, LaunchConcept, LaunchConceptId } from './types.js';
import type { LaunchConceptsModelOutput } from './concept-schema.js';

const TICKER_RE = /^[A-Z0-9]{2,10}$/;
const NAME_MAX = 48;
const DESC_MAX = 280;
const RATIONALE_MAX = 280;
const IMAGE_MAX = 280;

export class ConceptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConceptValidationError';
  }
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase().replace(/^\$/, '');
}

export function validateAndNormalizeConcepts(
  modelOutput: LaunchConceptsModelOutput,
  enabledQuotes: EnabledQuoteAsset[],
): [LaunchConcept, LaunchConcept, LaunchConcept] {
  if (enabledQuotes.length === 0) {
    throw new ConceptValidationError('No enabled quote assets available');
  }

  const byAddress = new Map(
    enabledQuotes.map((q) => [normalizeAddress(q.address), q] as const),
  );
  const bySymbol = new Map(
    enabledQuotes.map((q) => [q.symbol.trim().toUpperCase(), q] as const),
  );

  const expectedIds: LaunchConceptId[] = ['concept_1', 'concept_2', 'concept_3'];
  if (modelOutput.concepts.length !== 3) {
    throw new ConceptValidationError(`Expected exactly 3 concepts, got ${modelOutput.concepts.length}`);
  }

  const ids = modelOutput.concepts.map((c) => c.id);
  for (const id of expectedIds) {
    if (!ids.includes(id)) {
      throw new ConceptValidationError(`Missing concept id ${id}`);
    }
  }
  if (new Set(ids).size !== 3) {
    throw new ConceptValidationError('Concept ids must be unique');
  }

  const tickers = new Set<string>();
  const out: LaunchConcept[] = [];

  for (const id of expectedIds) {
    const raw = modelOutput.concepts.find((c) => c.id === id)!;
    const name = raw.name.trim();
    if (!name || name.length > NAME_MAX) {
      throw new ConceptValidationError(`${id}: invalid name length`);
    }

    const ticker = normalizeTicker(raw.ticker);
    if (!TICKER_RE.test(ticker)) {
      throw new ConceptValidationError(`${id}: invalid ticker "${raw.ticker}"`);
    }
    if (tickers.has(ticker)) {
      throw new ConceptValidationError(`${id}: duplicate ticker ${ticker}`);
    }
    tickers.add(ticker);

    const description = raw.description.trim();
    if (!description || description.length > DESC_MAX) {
      throw new ConceptValidationError(`${id}: invalid description`);
    }

    const pairRationale = raw.pairRationale.trim();
    if (!pairRationale || pairRationale.length > RATIONALE_MAX) {
      throw new ConceptValidationError(`${id}: invalid pairRationale`);
    }

    const imageDirection = raw.imageDirection.trim();
    if (!imageDirection || imageDirection.length > IMAGE_MAX) {
      throw new ConceptValidationError(`${id}: invalid imageDirection`);
    }

    const addrKey = normalizeAddress(raw.recommendedPairAddress);
    const quote = byAddress.get(addrKey);
    if (!quote) {
      // Soft path: symbol match only if address was wrong but symbol is canonical
      const sym = raw.recommendedPairSymbol.trim().toUpperCase();
      const bySym = bySymbol.get(sym);
      if (bySym && addrKey && addrKey !== normalizeAddress(bySym.address)) {
        throw new ConceptValidationError(
          `${id}: recommendedPairAddress ${raw.recommendedPairAddress} is not an enabled quote (symbol claimed ${sym})`,
        );
      }
      throw new ConceptValidationError(
        `${id}: recommendedPairAddress ${raw.recommendedPairAddress} is not in the enabled quote catalogue`,
      );
    }

    const claimedSymbol = raw.recommendedPairSymbol.trim().toUpperCase();
    if (claimedSymbol !== quote.symbol.toUpperCase()) {
      throw new ConceptValidationError(
        `${id}: recommendedPairSymbol ${raw.recommendedPairSymbol} does not match catalogue symbol ${quote.symbol} for address`,
      );
    }

    out.push({
      id,
      name,
      ticker,
      description,
      recommendedPairAddress: quote.address,
      recommendedPairSymbol: quote.symbol,
      pairRationale,
      imageDirection,
    });
  }

  return out as [LaunchConcept, LaunchConcept, LaunchConcept];
}

/** Revalidate a single chosen concept against the live enabled quote catalogue. */
export function revalidateLaunchConcept(
  concept: LaunchConcept,
  enabledQuotes: EnabledQuoteAsset[],
): LaunchConcept {
  if (enabledQuotes.length === 0) {
    throw new ConceptValidationError(
      'No enabled quote assets — regenerate concepts after quotes are enabled',
    );
  }

  const name = concept.name.trim();
  if (!name || name.length > NAME_MAX) {
    throw new ConceptValidationError('Invalid concept name');
  }

  const ticker = normalizeTicker(concept.ticker);
  if (!TICKER_RE.test(ticker)) {
    throw new ConceptValidationError(`Invalid concept ticker "${concept.ticker}"`);
  }

  const description = concept.description.trim();
  if (!description || description.length > DESC_MAX) {
    throw new ConceptValidationError('Invalid concept description');
  }

  const pairRationale = concept.pairRationale.trim();
  if (!pairRationale || pairRationale.length > RATIONALE_MAX) {
    throw new ConceptValidationError('Invalid concept pairRationale');
  }

  const imageDirection = concept.imageDirection.trim();
  if (!imageDirection || imageDirection.length > IMAGE_MAX) {
    throw new ConceptValidationError('Invalid concept imageDirection');
  }

  const byAddress = new Map(
    enabledQuotes.map((q) => [normalizeAddress(q.address), q] as const),
  );
  const quote = byAddress.get(normalizeAddress(concept.recommendedPairAddress));
  if (!quote) {
    throw new ConceptValidationError(
      `Recommended pair ${concept.recommendedPairAddress} is no longer enabled — regenerate concepts`,
    );
  }

  if (
    concept.recommendedPairSymbol.trim().toUpperCase() !==
    quote.symbol.toUpperCase()
  ) {
    throw new ConceptValidationError(
      `Pair symbol mismatch for ${concept.recommendedPairAddress}`,
    );
  }

  if (!['concept_1', 'concept_2', 'concept_3'].includes(concept.id)) {
    throw new ConceptValidationError(`Invalid concept id ${concept.id}`);
  }

  return {
    id: concept.id,
    name,
    ticker,
    description,
    recommendedPairAddress: quote.address,
    recommendedPairSymbol: quote.symbol,
    pairRationale,
    imageDirection,
  };
}

export function validateDraftTextFields(input: {
  name: string;
  symbol: string;
  description: string;
}): { name: string; symbol: string; description: string } {
  const name = input.name.trim();
  if (!name || name.length > NAME_MAX) {
    throw new ConceptValidationError('Invalid draft name');
  }
  const symbol = normalizeTicker(input.symbol);
  if (!TICKER_RE.test(symbol)) {
    throw new ConceptValidationError('Invalid draft symbol');
  }
  const description = input.description.trim();
  if (!description || description.length > DESC_MAX) {
    throw new ConceptValidationError('Invalid draft description');
  }
  return { name, symbol, description };
}

/** Pure helper for tests: can this pair address be accepted? */
export function isEnabledPairAddress(
  address: string,
  enabledQuotes: EnabledQuoteAsset[],
): boolean {
  const key = normalizeAddress(address);
  return enabledQuotes.some((q) => normalizeAddress(q.address) === key);
}
