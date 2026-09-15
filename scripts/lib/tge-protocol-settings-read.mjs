/**
 * Re-export read/classify helpers from the shared official-TAPE DB module
 * so Phase 1 imports keep working. Writes live only in tge-official-tape-db.mjs.
 */
export {
  TAPE_OFFICIAL_CONTRACT_KEY,
  classifyOfficialTapeDbState,
  normalizeStoredAddress,
  readOfficialTapeContract,
  resolveCanonicalTapeAfterDbStage,
} from './tge-official-tape-db.mjs';
