/**
 * Single explicit production execution gate for TGE finalizer mutation.
 *
 * Phase 3: ARMED = true.
 * There is exactly one gate. No env alias / hidden bypass.
 * Tests may pass armedOverride only into runTgeFinalizeMutation deps —
 * the production CLI never exposes or reads that flag.
 */
export const TGE_PRODUCTION_EXECUTION_ARMED = true;

/**
 * @param {{ armedOverride?: boolean }} [args]
 */
export function isTgeProductionExecutionArmed(args = {}) {
  if (typeof args.armedOverride === 'boolean') return args.armedOverride;
  return TGE_PRODUCTION_EXECUTION_ARMED === true;
}

export function buildProductionNotArmedMessage() {
  return (
    'TAPE TGE FINALIZER — PRODUCTION EXECUTION NOT YET ARMED\n' +
    '\n' +
    'The production gate constant is OFF.\n' +
    'No database or blockchain mutation has been performed.'
  );
}
