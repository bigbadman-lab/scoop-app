import { ROBINHOOD_CHAIN_LABEL } from '@/lib/brand';
import { absoluteSeoUrl } from '@/lib/seo/site';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';
import type { TokenDetail } from '@/lib/server/queries';

export const TOKEN_OG_SIZE = { width: 1200, height: 630 } as const;

export const TOKEN_OG_NAME_MAX = 48;

export type TokenOgCardModel = {
  kind: 'market';
  ticker: string;
  name: string;
  pairLabel: string;
  contractShort: string;
  networkLabel: string;
  /** Candidate HTTPS/IPFS-resolved URL — may still fail safe-load at render time. */
  logoCandidateUrl: string | null;
  monogram: string;
};

export type TokenOgUnavailableModel = {
  kind: 'unavailable';
  title: string;
  subtitle: string;
  networkLabel: string;
};

export type TokenOgModel = TokenOgCardModel | TokenOgUnavailableModel;

/** Canonical path for the file-based OG image route. */
export function tokenOpenGraphImagePath(tokenAddress: string): string {
  return `/token/${tokenAddress}/opengraph-image`;
}

export function tokenOpenGraphImageUrl(
  tokenAddress: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return absoluteSeoUrl(tokenOpenGraphImagePath(tokenAddress), env);
}

export function shortenContractAddress(address: string): string {
  const v = address.trim();
  if (v.length < 12) return v;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

export function formatTokenTicker(symbol: string | null | undefined): string {
  const raw = (symbol ?? '').trim().replace(/^\$+/, '');
  if (!raw) return '$TOKEN';
  return `$${raw.toUpperCase()}`;
}

export function formatTokenDisplayName(
  name: string | null | undefined,
  symbol: string | null | undefined,
): string {
  const n = (name ?? '').trim();
  if (n) return truncateOgText(n, TOKEN_OG_NAME_MAX);
  const sym = (symbol ?? '').trim();
  if (sym) return truncateOgText(sym, TOKEN_OG_NAME_MAX);
  return 'SCOOP market';
}

export function truncateOgText(value: string, max: number): string {
  const v = value.trim();
  if (v.length <= max) return v;
  if (max <= 1) return '…';
  return `${v.slice(0, max - 1)}…`;
}

export function tokenMonogram(symbol: string | null | undefined): string {
  const raw = (symbol ?? '').trim().replace(/^\$+/, '');
  if (!raw) return 'S';
  return raw.slice(0, 1).toUpperCase();
}

/**
 * Pure OG view-model from the same TokenDetail + quote label the token page uses.
 * Does not invent financial stats or missing identity.
 */
export function buildTokenOgCardModel(input: {
  token: Pick<
    TokenDetail,
    'tokenAddress' | 'name' | 'symbol' | 'displayImageUrl' | 'imageUri'
  >;
  quotePairLabel: string;
}): TokenOgCardModel {
  const symbol = input.token.symbol?.trim() || '';
  return {
    kind: 'market',
    ticker: formatTokenTicker(symbol),
    name: formatTokenDisplayName(input.token.name, symbol),
    pairLabel: truncateOgText(input.quotePairLabel.trim() || '—', 56),
    contractShort: shortenContractAddress(input.token.tokenAddress),
    networkLabel: ROBINHOOD_CHAIN_LABEL,
    logoCandidateUrl: pickTokenImageSrc(
      input.token.displayImageUrl,
      input.token.imageUri,
    ),
    monogram: tokenMonogram(symbol),
  };
}

export function buildTokenOgUnavailableModel(): TokenOgUnavailableModel {
  return {
    kind: 'unavailable',
    title: 'Market unavailable',
    subtitle: 'SCOOP could not load this market right now.',
    networkLabel: ROBINHOOD_CHAIN_LABEL,
  };
}
