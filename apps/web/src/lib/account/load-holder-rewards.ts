import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { getAuthenticatedScoopUser } from '@/lib/auth/session';
import { getServerPool } from '@/lib/server/db';
import { isHolderRewardsAccountEnabled } from '@/lib/holder-rewards/feature';
import type {
  HolderRewardEntitlementDto,
  PublicHolderRewardsResponse,
} from '@/lib/holder-rewards/types';
import {
  listHolderRewardEntitlementsForAccount,
  type HolderRewardAccountEntitlement,
} from '@scoop/db';
import type { Address, Hex } from 'viem';

export type HolderRewardsLoaderResult =
  | { ok: true; body: PublicHolderRewardsResponse }
  | { ok: false; status: 401 | 500; code: string; error: string };

function emptyDisabled(account: string | null = null): PublicHolderRewardsResponse {
  return {
    enabled: false,
    account,
    entitlements: [],
  };
}

function mapEntitlement(row: HolderRewardAccountEntitlement): HolderRewardEntitlementDto {
  return {
    chainId: row.chainId,
    vault: row.vault as Address,
    tokenAddress: row.tokenAddress as Address,
    roundId: row.roundId,
    asset: row.asset as Address,
    account: row.account as Address,
    entitlementRaw: row.entitlementRaw,
    leafHash: row.leafHash as Hex,
    proof: row.proof as Hex[],
    snapshotBlock: row.snapshotBlock,
    workerRoundStatus: row.workerRoundStatus,
    workerMerkleRoot: (row.workerMerkleRoot as Hex | null) ?? null,
    publishedTxHash: (row.publishedTxHash as Hex | null) ?? null,
  };
}

/**
 * Server-only holder rewards loader.
 * Fail closed: gated-off → empty disabled payload (no P5/P8 SQL).
 * Never accepts a client-supplied account override.
 */
export async function loadAuthenticatedHolderRewards(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HolderRewardsLoaderResult> {
  const session = getAuthenticatedScoopUser(request);
  if (!session) {
    return {
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Sign in to view holder rewards',
    };
  }

  const account = session.address.toLowerCase();

  if (!isHolderRewardsAccountEnabled(env)) {
    return { ok: true, body: emptyDisabled(account) };
  }

  try {
    const pool = getServerPool();
    const rows = await listHolderRewardEntitlementsForAccount(pool, {
      chainId: ROBINHOOD_CHAIN_ID,
      account,
    });
    return {
      ok: true,
      body: {
        enabled: true,
        account,
        entitlements: rows.map(mapEntitlement),
      },
    };
  } catch {
    // Fail closed without leaking internal DB/schema errors to the client.
    return {
      ok: false,
      status: 500,
      code: 'HOLDER_REWARDS_LOAD_FAILED',
      error: 'Could not load holder rewards',
    };
  }
}
