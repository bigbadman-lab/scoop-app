import { PublicKey } from '@solana/web3.js';
import { parseSolanaPublicKey } from '@/lib/solana/pubkey';
import {
  PUMP_FIELD_LIMITS,
  type PumpCreateInput,
  type PumpCreateValidated,
} from '@/lib/launch/adapters/pump/types';

export type PumpValidationErrors = Partial<
  Record<'name' | 'symbol' | 'uri' | 'creator' | 'user' | 'mint', string>
>;

function charLength(value: string): number {
  return [...value].length;
}

export function validatePumpCreateInput(input: PumpCreateInput): PumpValidationErrors {
  const errors: PumpValidationErrors = {};
  const name = input.name.trim();
  const symbol = input.symbol.trim();
  const uri = input.uri.trim();

  if (!name) errors.name = 'Name is required.';
  else if (charLength(name) > PUMP_FIELD_LIMITS.nameMax) {
    errors.name = `Name must be ${PUMP_FIELD_LIMITS.nameMax} characters or fewer.`;
  }

  if (!symbol) errors.symbol = 'Symbol is required.';
  else if (charLength(symbol) > PUMP_FIELD_LIMITS.symbolMax) {
    errors.symbol = `Symbol must be ${PUMP_FIELD_LIMITS.symbolMax} characters or fewer.`;
  }

  if (!uri) errors.uri = 'Metadata URI is required.';
  else if (charLength(uri) > PUMP_FIELD_LIMITS.uriMax) {
    errors.uri = `URI must be ${PUMP_FIELD_LIMITS.uriMax} characters or fewer.`;
  }

  const creator = parseSolanaPublicKey(input.creator);
  if (!creator || PublicKey.default.equals(creator)) {
    errors.creator = 'Creator must be a non-default Solana public key.';
  }

  const user = parseSolanaPublicKey(input.user);
  if (!user || PublicKey.default.equals(user)) {
    errors.user = 'User must be a non-default Solana public key.';
  }

  const mint = parseSolanaPublicKey(input.mint);
  if (!mint || PublicKey.default.equals(mint)) {
    errors.mint = 'Mint must be a valid Solana public key.';
  }

  return errors;
}

export function assertPumpCreateInput(input: PumpCreateInput): PumpCreateValidated {
  const errors = validatePumpCreateInput(input);
  const first = Object.values(errors)[0];
  if (first) throw new Error(first);

  return {
    name: input.name.trim(),
    symbol: input.symbol.trim(),
    uri: input.uri.trim(),
    creator: parseSolanaPublicKey(input.creator)!,
    user: parseSolanaPublicKey(input.user)!,
    mint: parseSolanaPublicKey(input.mint)!,
  };
}
