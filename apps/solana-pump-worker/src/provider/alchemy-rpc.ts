/**
 * Minimal Solana JSON-RPC client for Alchemy (HTTPS).
 * Never logs the RPC URL or API key.
 */

export type SolanaRpcCall = <T>(method: string, params: unknown[] | Record<string, unknown>) => Promise<T>;

export type JsonParsedTokenBalance = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount?: {
    amount?: string;
    decimals?: number;
    uiAmountString?: string;
  };
};

export type JsonParsedTransaction = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee?: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: JsonParsedTokenBalance[];
    postTokenBalances?: JsonParsedTokenBalance[];
    logMessages?: string[];
    innerInstructions?: Array<{
      index: number;
      instructions: Array<{
        programId?: string;
        program?: string;
        parsed?: unknown;
        data?: string;
        accounts?: string[];
      }>;
    }>;
  } | null;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer?: boolean; writable?: boolean }>;
      instructions?: Array<{
        programId?: string;
        program?: string;
        parsed?: unknown;
        data?: string;
        accounts?: string[];
      }>;
    };
    signatures?: string[];
  };
};

export type SignatureInfo = {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
};

export type TokenSupplyResult = {
  amount: string;
  decimals: number;
  uiAmountString?: string;
};

export function createSolanaRpc(rpcUrl: string): SolanaRpcCall {
  const url = rpcUrl.trim();
  if (!url) throw new Error('SOLANA_RPC_URL is required');

  return async function rpcCall<T>(
    method: string,
    params: unknown[] | Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) {
      throw new Error(`solana rpc http ${res.status}`);
    }
    const body = (await res.json()) as { result?: T; error?: { message?: string; code?: number } };
    if (body.error) {
      throw new Error(body.error.message ?? `solana rpc error ${body.error.code ?? ''}`);
    }
    return body.result as T;
  };
}

export function httpRpcToWsUrl(rpcUrl: string): string {
  const u = new URL(rpcUrl.trim());
  if (u.protocol === 'https:') u.protocol = 'wss:';
  else if (u.protocol === 'http:') u.protocol = 'ws:';
  else throw new Error('SOLANA_RPC_URL must be http(s)');
  return u.toString();
}

export function classifyRpcProvider(rpcUrl: string): 'alchemy' | 'other' {
  try {
    const host = new URL(rpcUrl).hostname.toLowerCase();
    return host.includes('alchemy') ? 'alchemy' : 'other';
  } catch {
    return 'other';
  }
}

export async function getHealth(rpc: SolanaRpcCall): Promise<string> {
  try {
    const result = await rpc<string | null>('getHealth', []);
    return result ?? 'ok';
  } catch (error) {
    // Some providers reject getHealth; treat successful other calls as healthy.
    const message = error instanceof Error ? error.message : String(error);
    if (/method not found|invalid/i.test(message)) return 'ok';
    throw error;
  }
}

export async function getGenesisHash(rpc: SolanaRpcCall): Promise<string> {
  return rpc<string>('getGenesisHash', []);
}

export async function getTransaction(
  rpc: SolanaRpcCall,
  signature: string,
): Promise<JsonParsedTransaction | null> {
  return rpc<JsonParsedTransaction | null>('getTransaction', [
    signature,
    {
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 1,
      commitment: 'confirmed',
    },
  ]);
}

export async function getSignaturesForAddress(
  rpc: SolanaRpcCall,
  address: string,
  opts: { limit?: number; before?: string; until?: string } = {},
): Promise<SignatureInfo[]> {
  const config: Record<string, unknown> = {
    limit: opts.limit ?? 50,
    commitment: 'confirmed',
  };
  if (opts.before) config.before = opts.before;
  if (opts.until) config.until = opts.until;
  return rpc<SignatureInfo[]>('getSignaturesForAddress', [address, config]);
}

export async function getTokenSupply(
  rpc: SolanaRpcCall,
  mint: string,
): Promise<TokenSupplyResult> {
  const result = await rpc<{ value: TokenSupplyResult }>('getTokenSupply', [mint]);
  return result.value;
}
