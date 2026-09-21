/** Shared Pump public-flow constants (safe for client + server). */

/** Conservative floor for create_v2 rent + fees (lamports). */
export const PUMP_MIN_SOL_LAMPORTS = BigInt(15_000_000);

/** Controlled prepare error when balance cannot cover create + optional DEV BUY. */
export const INSUFFICIENT_SOL_FOR_LAUNCH_AND_DEV_BUY =
  'insufficient_sol_for_launch_and_dev_buy' as const;
