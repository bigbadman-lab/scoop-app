import type { Hex } from 'viem';

/**
 * Launch CREATE2 user salt.
 *
 * Factory salts: launchSalt = keccak256(abi.encode(msg.sender, params.salt)).
 * App supplies `params.salt` only.
 *
 * Strategy (V2.B):
 * - source: crypto.getRandomValues (32 bytes) at wizard session start
 * - format: bytes32 hex
 * - lifetime: stable for the form session (createInitialLaunchState)
 * - regenerate: only on RESET (new session) — not on step nav / wallet switch
 * - draft resume: if a draft later carries salt, prefer preserving it
 */
export function generateLaunchSalt(randomBytes?: Uint8Array): Hex {
  const bytes = randomBytes ?? crypto.getRandomValues(new Uint8Array(32));
  if (bytes.length !== 32) {
    throw new Error('Launch salt must be 32 bytes');
  }
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex as Hex;
}

export function isValidLaunchSalt(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}
