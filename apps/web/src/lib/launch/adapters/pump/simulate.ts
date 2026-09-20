import type { Connection, Transaction } from '@solana/web3.js';
import { inspectCreateInstructionAccounts } from '@/lib/launch/adapters/pump/build-create';
import type { PumpPreparedCreate, PumpSimulateReport } from '@/lib/launch/adapters/pump/types';

/**
 * Simulate a mint-partially-signed Pump create tx without broadcasting.
 * Uses sigVerify:false because the wallet fee-payer has not signed yet.
 */
export async function simulatePumpCreateTransaction(args: {
  connection: Connection;
  transaction: Transaction;
  prepared: PumpPreparedCreate;
}): Promise<PumpSimulateReport> {
  const checks = inspectCreateInstructionAccounts(args.prepared.instruction);

  try {
    // web3.js 1.98: passing { sigVerify, replaceRecentBlockhash } hits an
    // overloaded signature and throws "Invalid arguments". Bare simulate works
    // for mint-partially-signed / fee-payer-unsigned create txs.
    const result = await args.connection.simulateTransaction(args.transaction);

    const err = result.value.err;
    const logs = result.value.logs ?? [];
    const ok = err === null;
    const errorText =
      err === null
        ? null
        : typeof err === 'string'
          ? err
          : JSON.stringify(err);

    return {
      ok,
      status: ok ? 'PASS' : 'BLOCKED',
      slot: result.context.slot,
      unitsConsumed: result.value.unitsConsumed ?? null,
      error: errorText,
      logs: logs.slice(-40),
      checks: {
        pumpProgram: checks.pumpProgram,
        token2022: checks.token2022,
        mintIsSigner: checks.mintIsSigner,
        userIsSigner: checks.userIsSigner,
        accountCount: checks.accountCount,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 'BLOCKED',
      slot: null,
      unitsConsumed: null,
      error: err instanceof Error ? err.message : 'simulateTransaction failed',
      logs: [],
      checks: {
        pumpProgram: checks.pumpProgram,
        token2022: checks.token2022,
        mintIsSigner: checks.mintIsSigner,
        userIsSigner: checks.userIsSigner,
        accountCount: checks.accountCount,
      },
    };
  }
}
