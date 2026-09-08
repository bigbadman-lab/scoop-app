import { SiweMessage } from 'siwe';
import { normalizeAddress } from '@/lib/auth/address';

export const SIWE_STATEMENT =
  'Finish signing in to SCOOP. This confirms it is you - not a payment.';

/** Client-safe SIWE message builder (no Node crypto). */
export function buildSiweMessage(input: {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
}): string {
  const address = normalizeAddress(input.address);
  if (!address) throw new Error('Invalid address');
  const message = new SiweMessage({
    domain: input.domain,
    address,
    statement: SIWE_STATEMENT,
    uri: input.uri,
    version: '1',
    chainId: input.chainId,
    nonce: input.nonce,
  });
  return message.prepareMessage();
}

/** Only allow resume paths under /news/{id}/launch — never open redirects. */
export function sanitizeAssistResumePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.trim();
  if (!path.startsWith('/')) return null;
  if (path.startsWith('//') || path.includes('://')) return null;
  if (path.includes('\\') || path.includes('\n') || path.includes('\r')) return null;
  const match = /^\/news\/([^/?#]+)\/launch\/?$/.exec(path);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]!);
    if (!id.trim() || id.includes('..')) return null;
    return `/news/${encodeURIComponent(id)}/launch`;
  } catch {
    return null;
  }
}
