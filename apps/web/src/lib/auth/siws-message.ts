/**
 * Sign-In With Solana message (Phantom / wallet-standard compatible text).
 * Client-safe: no signature verification.
 */

export const SIWS_STATEMENT =
  'Finish signing in to SCOOP. This confirms it is you - not a payment.';

export const SIWS_CHAIN_ID = 'mainnet';
export const SIWS_VERSION = '1';

export type SiwsMessageFields = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

export function buildSiwsMessage(fields: SiwsMessageFields): string {
  return [
    `${fields.domain} wants you to sign in with your Solana account:`,
    fields.address,
    '',
    fields.statement,
    '',
    `URI: ${fields.uri}`,
    `Version: ${fields.version}`,
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
    `Expiration Time: ${fields.expirationTime}`,
  ].join('\n');
}

export function parseSiwsMessage(message: string): SiwsMessageFields | null {
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  if (lines.length < 11) return null;
  const domainLine = lines[0] ?? '';
  const domain = domainLine.replace(
    / wants you to sign in with your Solana account:$/,
    '',
  );
  if (domain === domainLine || !domain.trim()) return null;
  const address = (lines[1] ?? '').trim();
  if (!address) return null;
  if ((lines[2] ?? '') !== '') return null;
  const statement = lines[3] ?? '';
  if ((lines[4] ?? '') !== '') return null;

  const rest = lines.slice(5);
  const map = new Map<string, string>();
  for (const line of rest) {
    const idx = line.indexOf(': ');
    if (idx <= 0) return null;
    map.set(line.slice(0, idx), line.slice(idx + 2));
  }
  const uri = map.get('URI');
  const version = map.get('Version');
  const chainId = map.get('Chain ID');
  const nonce = map.get('Nonce');
  const issuedAt = map.get('Issued At');
  const expirationTime = map.get('Expiration Time');
  if (!uri || !version || !chainId || !nonce || !issuedAt || !expirationTime) {
    return null;
  }
  return {
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    expirationTime,
  };
}
