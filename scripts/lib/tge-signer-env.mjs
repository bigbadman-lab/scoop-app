/**
 * Load / derive TGE signer from TAPE_TGE_SIGNER_PRIVATE_KEY.
 * Never log the key or account object containing it.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { TAPE_TGE_SIGNER_PRIVATE_KEY_ENV } from './tge-constants.mjs';

/**
 * Sanitize operator-facing errors (viem may embed request material).
 * @param {unknown} error
 */
export function sanitizeSignerError(error) {
  let message = error instanceof Error ? error.message : String(error);
  message = message
    .replace(/0x[a-fA-F0-9]{64}/g, '[redacted-hex]')
    .replace(/private\s*key[^\n]*/gi, 'private key [redacted]')
    .replace(/TAPE_TGE_SIGNER_PRIVATE_KEY=[^\s]+/gi, 'TAPE_TGE_SIGNER_PRIVATE_KEY=[redacted]');
  return message;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   ok: true,
 *   privateKey: `0x${string}`,
 * } | {
 *   ok: false,
 *   reason: string,
 * }}
 */
export function loadTapeTgeSignerPrivateKey(env) {
  const raw = env?.[TAPE_TGE_SIGNER_PRIVATE_KEY_ENV];
  if (raw == null || String(raw).trim() === '') {
    return {
      ok: false,
      reason: 'BLOCKED — TAPE TGE SIGNER PRIVATE KEY NOT CONFIGURED',
    };
  }
  let key = String(raw).trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1).trim();
  if (key.startsWith("'") && key.endsWith("'")) key = key.slice(1, -1).trim();
  if (!key.startsWith('0x') && !key.startsWith('0X')) key = `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return {
      ok: false,
      reason: 'BLOCKED — TAPE TGE SIGNER PRIVATE KEY INVALID',
    };
  }
  return { ok: true, privateKey: /** @type {`0x${string}`} */ (key) };
}

/**
 * @param {`0x${string}`} privateKey
 * @returns {{ ok: true, address: `0x${string}`, account: import('viem').Account } | { ok: false, reason: string }}
 */
export function createTapeTgeSignerAccount(privateKey) {
  try {
    const account = privateKeyToAccount(privateKey);
    return { ok: true, address: account.address, account };
  } catch (error) {
    return {
      ok: false,
      reason: `BLOCKED — TAPE TGE SIGNER PRIVATE KEY INVALID (${sanitizeSignerError(error)})`,
    };
  }
}

/**
 * Convenience: env → account without exposing key on success object beyond account
 * (callers must not log account). Prefer returning only address for display.
 *
 * @param {Record<string, string | undefined>} env
 */
export function resolveTapeTgeSignerFromEnv(env) {
  const loaded = loadTapeTgeSignerPrivateKey(env);
  if (!loaded.ok) return loaded;
  const created = createTapeTgeSignerAccount(loaded.privateKey);
  // Drop private key reference from this scope after account creation.
  return created;
}

export { TAPE_TGE_SIGNER_PRIVATE_KEY_ENV };
