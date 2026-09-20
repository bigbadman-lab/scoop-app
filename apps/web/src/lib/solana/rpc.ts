import { Connection } from '@solana/web3.js';
import { SOLANA_CLUSTER } from '@/lib/solana/networks';

/**
 * Server-side Solana mainnet RPC — independent of Robinhood / viem / Wagmi.
 * Prefer SOLANA_RPC_URL (never reuse ROBINHOOD_*).
 */

export { SOLANA_CLUSTER };

export class SolanaRpcConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolanaRpcConfigError';
  }
}

/** Resolve Solana HTTPS RPC. Does not log the URL (may contain API keys). */
export function resolveSolanaRpcUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = (env.SOLANA_RPC_URL ?? '').trim();
  if (!url) {
    throw new SolanaRpcConfigError(
      'SOLANA_RPC_URL is required for Solana RPC (mainnet-beta). Do not reuse ROBINHOOD_RPC_URL.',
    );
  }
  if (!/^https:\/\//i.test(url)) {
    throw new SolanaRpcConfigError('SOLANA_RPC_URL must be an https:// endpoint.');
  }
  return url;
}

export function isSolanaRpcConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    resolveSolanaRpcUrl(env);
    return true;
  } catch {
    return false;
  }
}

/** Create a @solana/web3.js Connection for mainnet-beta. */
export function createSolanaConnection(env: NodeJS.ProcessEnv = process.env): Connection {
  return new Connection(resolveSolanaRpcUrl(env), {
    commitment: 'confirmed',
  });
}

export type SolanaRpcHealth = {
  ok: boolean;
  cluster: typeof SOLANA_CLUSTER;
  slot: number | null;
  error: string | null;
};

/** Lightweight health probe — getSlot only; never logs the RPC URL. */
export async function checkSolanaRpcHealth(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SolanaRpcHealth> {
  try {
    const connection = createSolanaConnection(env);
    const slot = await connection.getSlot('confirmed');
    return { ok: true, cluster: SOLANA_CLUSTER, slot, error: null };
  } catch (err) {
    const message =
      err instanceof SolanaRpcConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown Solana RPC error';
    return { ok: false, cluster: SOLANA_CLUSTER, slot: null, error: message };
  }
}
