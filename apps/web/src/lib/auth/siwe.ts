import { SiweMessage } from 'siwe';
import { createPublicClient, http } from 'viem';
import { normalizeAddress, sessionAddress } from '@/lib/auth/address';

export { SIWE_STATEMENT, buildSiweMessage, sanitizeAssistResumePath } from '@/lib/auth/siwe-client';

export async function verifySiweSignature(input: {
  message: string;
  signature: string;
  expectedNonce: string;
  expectedDomain: string;
}): Promise<{ address: `0x${string}`; chainId: number } | null> {
  let siwe: SiweMessage;
  try {
    siwe = new SiweMessage(input.message);
  } catch {
    return null;
  }

  if (siwe.nonce !== input.expectedNonce) return null;
  if (siwe.domain !== input.expectedDomain) return null;

  const address = sessionAddress(siwe.address);
  if (!address) return null;

  const chainId =
    typeof siwe.chainId === 'number'
      ? siwe.chainId
      : Number.parseInt(String(siwe.chainId), 10);
  if (!Number.isInteger(chainId) || chainId <= 0) return null;

  // Prefer Robinhood RPC when available; otherwise use a public eth RPC for EOA verify.
  const rpc =
    (process.env.ROBINHOOD_RPC_URL ?? '').trim() ||
    (process.env.ROBINHOOD_FALLBACK_RPC_URL ?? '').trim() ||
    'https://rpc.mainnet.chain.robinhood.com';

  const client = createPublicClient({
    transport: http(rpc),
  });

  try {
    const verifyAddress = normalizeAddress(siwe.address);
    if (!verifyAddress) return null;
    const valid = await client.verifyMessage({
      address: verifyAddress,
      message: input.message,
      signature: input.signature as `0x${string}`,
    });
    if (!valid) return null;
  } catch {
    // Fallback: siwe package validation (EOA)
    try {
      const result = await siwe.verify({
        signature: input.signature,
        nonce: input.expectedNonce,
        domain: input.expectedDomain,
      });
      if (!result.success) return null;
    } catch {
      return null;
    }
  }

  return { address, chainId };
}
