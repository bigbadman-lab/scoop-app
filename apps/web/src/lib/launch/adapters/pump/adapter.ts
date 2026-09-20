/**
 * Pump launch adapter — client-safe exports (Gate C).
 *
 * Signing model (create_v2):
 * 1. Browser generates mint Keypair (mint-lifecycle) — secret never leaves the client.
 * 2. Server builds createV2Instruction with mint pubkey (see build-create.ts).
 * 3. Client partialSign(mint) then Reown Provider.signTransaction for the user.
 * 4. Only Gate D+ may broadcast.
 *
 * Server/test builders live in build-create.ts / simulate.ts / sdk.ts —
 * do not re-export them here (would pull CJS Pump SDK into the client bundle).
 */

export { projectPumpMetadataUri } from './metadata';
export {
  assertMintHandleHasNoSecret,
  clearPumpMintAttempt,
  createPumpMintAttempt,
  getPumpMintKeypair,
  peekPumpMintPublicKey,
  replacePumpMintAttempt,
} from './mint-lifecycle';
export {
  PUMP_CREATE_DEFAULTS,
  PUMP_FIELD_LIMITS,
  PUMP_PROGRAM_ID_MAINNET,
  TOKEN_2022_PROGRAM_ID,
} from './types';
export type {
  PumpCreateInput,
  PumpMintHandle,
  PumpPreparedCreate,
  PumpSimulateReport,
} from './types';
export {
  assertPumpCreateInput,
  validatePumpCreateInput,
} from './validation';
