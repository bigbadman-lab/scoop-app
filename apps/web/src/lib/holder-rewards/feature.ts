/**
 * Holder rewards account UX gate.
 *
 * Production Supabase is still pre-P5/pre-P8. This gate MUST stay default-off so
 * `/account` never executes SQL against missing
 * `holder_reward_entitlements` / `holder_reward_worker_rounds` tables
 * (or `launches.holder_rewards_address`) until ops deliberately enables it
 * after migrations are applied.
 *
 * This is an explicit config switch — never inferred from wallet connection
 * or from the historical Factory / canary manifest.
 */
export function isHolderRewardsAccountEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
