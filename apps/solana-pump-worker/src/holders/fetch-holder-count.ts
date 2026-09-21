/**
 * Alchemy DAS `getTokenAccounts` → unique positive-balance Solana holders.
 * Isolated from trade ingestion / UI.
 */

import type { SolanaRpcCall } from '../provider/alchemy-rpc.js';

export type SolanaTokenAccountBalance = {
  /** Token account address (base58). */
  address: string;
  /** Owner wallet (base58) — never lowercased. */
  owner: string;
  /** Raw token amount as bigint. */
  amount: bigint;
};

export type SolanaHolderCountResult = {
  holderCount: number;
  positiveTokenAccountCount: number;
  totalTokenAccountCount: number;
  pagesFetched: number;
};

export type GetTokenAccountsPage = {
  tokenAccounts: SolanaTokenAccountBalance[];
  cursor: string | null;
  total?: number;
};

const DEFAULT_PAGE_LIMIT = 1000;
/** Safety cap — terminate rather than loop forever on a broken cursor. */
const MAX_PAGES = 5_000;

export function parseRawTokenAmount(raw: unknown): bigint {
  if (typeof raw === 'bigint') {
    if (raw < 0n) throw new Error('negative token amount');
    return raw;
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
      throw new Error(`invalid token amount number: ${raw}`);
    }
    return BigInt(raw);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) throw new Error(`invalid token amount string: ${raw}`);
    return BigInt(t);
  }
  throw new Error(`unsupported token amount type: ${typeof raw}`);
}

/**
 * Aggregate token accounts by owner; count owners with aggregate > 0.
 * Pure — used by fetcher and unit tests.
 */
export function aggregateSolanaHolderCount(
  accounts: readonly SolanaTokenAccountBalance[],
): Pick<
  SolanaHolderCountResult,
  'holderCount' | 'positiveTokenAccountCount' | 'totalTokenAccountCount'
> {
  const balancesByOwner = new Map<string, bigint>();
  let positiveTokenAccountCount = 0;

  for (const account of accounts) {
    const owner = account.owner.trim();
    if (!owner) continue;
    if (account.amount > 0n) positiveTokenAccountCount += 1;
    const prev = balancesByOwner.get(owner) ?? 0n;
    balancesByOwner.set(owner, prev + account.amount);
  }

  let holderCount = 0;
  for (const balance of balancesByOwner.values()) {
    if (balance > 0n) holderCount += 1;
  }

  return {
    holderCount,
    positiveTokenAccountCount,
    totalTokenAccountCount: accounts.length,
  };
}

export function parseGetTokenAccountsResult(raw: unknown): GetTokenAccountsPage {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('getTokenAccounts: empty result');
  }
  const body = raw as Record<string, unknown>;
  const list = body.token_accounts ?? body.tokenAccounts;
  if (!Array.isArray(list)) {
    throw new Error('getTokenAccounts: missing token_accounts');
  }

  const tokenAccounts: SolanaTokenAccountBalance[] = list.map((item, index) => {
    if (item == null || typeof item !== 'object') {
      throw new Error(`getTokenAccounts: invalid account at ${index}`);
    }
    const row = item as Record<string, unknown>;
    const owner = typeof row.owner === 'string' ? row.owner.trim() : '';
    if (!owner) throw new Error(`getTokenAccounts: missing owner at ${index}`);
    const address =
      typeof row.address === 'string' && row.address.trim()
        ? row.address.trim()
        : owner;
    return {
      address,
      owner,
      amount: parseRawTokenAmount(row.amount),
    };
  });

  const cursorRaw = body.cursor;
  const cursor =
    typeof cursorRaw === 'string' && cursorRaw.trim() !== ''
      ? cursorRaw.trim()
      : null;

  const total =
    typeof body.total === 'number' && Number.isFinite(body.total)
      ? body.total
      : undefined;

  return { tokenAccounts, cursor, total };
}

export type FetchSolanaHolderCountOptions = {
  pageLimit?: number;
  maxPages?: number;
  /** Include zero-balance accounts (default true — needed for accurate totals). */
  showZeroBalance?: boolean;
  /** Injectable page fetch for tests. */
  fetchPage?: (
    mint: string,
    cursor: string | null,
  ) => Promise<GetTokenAccountsPage>;
};

/** Alchemy DAS page fetch — params must be a bare object, not an array. */
export async function fetchGetTokenAccountsPage(
  rpc: SolanaRpcCall,
  mint: string,
  cursor: string | null,
  pageLimit: number,
  showZeroBalance: boolean,
): Promise<GetTokenAccountsPage> {
  const params: Record<string, unknown> = {
    mintAddress: mint,
    limit: pageLimit,
    options: { showZeroBalance },
  };
  if (cursor) params.cursor = cursor;
  const result = await rpc<unknown>('getTokenAccounts', params);
  return parseGetTokenAccountsResult(result);
}

export async function fetchSolanaHolderCountPages(
  mint: string,
  opts: {
    maxPages: number;
    fetchPage: (mint: string, cursor: string | null) => Promise<GetTokenAccountsPage>;
  },
): Promise<SolanaHolderCountResult> {
  const all: SolanaTokenAccountBalance[] = [];
  let cursor: string | null = null;
  let pagesFetched = 0;
  let previousCursor: string | null | undefined = undefined;

  while (pagesFetched < opts.maxPages) {
    const page = await opts.fetchPage(mint, cursor);
    pagesFetched += 1;
    all.push(...page.tokenAccounts);

    if (page.tokenAccounts.length === 0) {
      break;
    }
    if (!page.cursor) {
      break;
    }
    if (previousCursor !== undefined && page.cursor === previousCursor) {
      throw new Error('getTokenAccounts: cursor did not advance');
    }
    if (page.cursor === cursor) {
      throw new Error('getTokenAccounts: repeated cursor');
    }
    previousCursor = cursor;
    cursor = page.cursor;
  }

  if (pagesFetched >= opts.maxPages) {
    throw new Error(`getTokenAccounts: exceeded max pages (${opts.maxPages})`);
  }

  const agg = aggregateSolanaHolderCount(all);
  return { ...agg, pagesFetched };
}

/**
 * Enumerate all token accounts for a mint via Alchemy DAS `getTokenAccounts`.
 */
export async function fetchSolanaHolderCount(
  rpc: SolanaRpcCall,
  mint: string,
  opts: FetchSolanaHolderCountOptions = {},
): Promise<SolanaHolderCountResult> {
  const mintKey = mint.trim();
  if (!mintKey) throw new Error('mint is required');

  const pageLimit = opts.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const showZeroBalance = opts.showZeroBalance !== false;

  return fetchSolanaHolderCountPages(mintKey, {
    maxPages,
    fetchPage:
      opts.fetchPage ??
      ((m, cursor) =>
        fetchGetTokenAccountsPage(rpc, m, cursor, pageLimit, showZeroBalance)),
  });
}
