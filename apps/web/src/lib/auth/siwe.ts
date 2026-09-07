import { SiweMessage } from 'siwe';
import { createPublicClient, http } from 'viem';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { normalizeAddress, sessionAddress } from '@/lib/auth/address';
import {
  isRobinhoodSiweChainId,
  isSiweIssuedAtAcceptable,
  normalizeSiweOrigin,
} from '@/lib/auth/siwe-challenge';

export { SIWE_STATEMENT, buildSiweMessage, sanitizeAssistResumePath } from '@/lib/auth/siwe-client';
export {
  resolveSiweExpectedDomain,
  resolveSiweExpectedUri,
  isRobinhoodSiweChainId,
  isSiweIssuedAtAcceptable,
} from '@/lib/auth/siwe-challenge';

export async function verifySiweSignature(input: {
  message: string;
  signature: string;
  expectedNonce: string;
  expectedDomain: string;
  expectedUri: string;
  expectedChainId?: number;
  now?: number;
}): Promise<{ address: `0x${string}`; chainId: number } | null> {
  const expectedChainId = input.expectedChainId ?? ROBINHOOD_CHAIN_ID;
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(input.message);
  } catch {
    return null;
  }

  if (siwe.nonce !== input.expectedNonce) return null;
  if (siwe.domain !== input.expectedDomain) return null;
  if (normalizeSiweOrigin(siwe.uri ?? '') !== normalizeSiweOrigin(input.expectedUri)) {
    return null;
  }
  if (siwe.version !== '1') return null;

  const address = sessionAddress(siwe.address);
  if (!address) return null;

  const chainId =
    typeof siwe.chainId === 'number'
      ? siwe.chainId
      : Number.parseInt(String(siwe.chainId), 10);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;
  if (chainId !== expectedChainId || !isRobinhoodSiweChainId(chainId)) return null;

  if (!isSiweIssuedAtAcceptable(siwe.issuedAt, input.now ?? Date.now())) return null;

  if (siwe.expirationTime) {
    const exp = Date.parse(siwe.expirationTime);
    if (!Number.isFinite(exp) || (input.now ?? Date.now()) > exp) return null;
  }

  // Prefer offline SIWE/EOA verification first (no network); RPC for smart wallets.
  try {
    const result = await siwe.verify({
      signature: input.signature,
      nonce: input.expectedNonce,
      domain: input.expectedDomain,
      time: new Date(input.now ?? Date.now()).toISOString(),
    });
    if (result.success) {
      return { address, chainId };
    }
  } catch {
    /* try RPC path */
  }

  const rpc =
    (process.env.ROBINHOOD_RPC_URL ?? '').trim() ||
    (process.env.ROBINHOOD_FALLBACK_RPC_URL ?? '').trim() ||
    'https://rpc.mainnet.chain.robinhood.com';

  try {
    const verifyAddress = normalizeAddress(siwe.address);
    if (!verifyAddress) return null;
    const client = createPublicClient({
      transport: http(rpc),
    });
    const valid = await client.verifyMessage({
      address: verifyAddress,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
    if (!valid) return null;
  } catch {
    return null;
  }

  return { address, chainId };
}
