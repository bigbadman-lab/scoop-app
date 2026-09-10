import type { Queryable } from '../types.js';
import { formatRawAmount } from '../decimal.js';
import { normalizeAddress } from '../hex.js';
import { DEFAULT_QUOTE_DECIMALS } from './_discoverySql.js';
import type { ScoopWalletProvider, ScoopWalletType } from '../repos/scoop-identity.js';

export type ScoopProfileRecord = {
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  createdAt: string;
  joinedAt: string;
  status: string;
};

export type ScoopAccountWallet = {
  address: string;
  walletType: ScoopWalletType;
  provider: ScoopWalletProvider;
  isPrimary: boolean;
};

export type ScoopAccountLaunch = {
  chainId: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  imageUri: string | null;
  /** SCOOP-controlled HTTPS display copy; prefer over imageUri for UI. */
  displayImageUrl: string | null;
  quoteAsset: string;
  launchedAt: number;
  launchComplete: boolean;
  creatorId: string;
};

export type ScoopFeeAssetLine = {
  assetKind: string;
  assetAddress: string;
  symbol: string;
  amountRaw: string;
  amountDisplay: string;
  /** Present for creator fees only. */
  claimableRaw?: string;
  claimableDisplay?: string;
  creditedRaw?: string;
  claimedRaw?: string;
  claimedDisplay?: string;
  /** Optional canonical token metadata (creator/token assets). */
  name?: string | null;
  decimals?: number | null;
  displayImageUrl?: string | null;
  /** Protocol IPFS/HTTP imageUri — fallback when displayImageUrl absent. */
  imageUri?: string | null;
};

export type ScoopAccountBundle = {
  user: ScoopProfileRecord;
  wallet: ScoopAccountWallet;
  tokensLaunched: ScoopAccountLaunch[];
  fees: {
    deployer: {
      label: 'deployer';
      /** Lifetime accrued from fee_distributions.deployer_raw — not claimable/claimed. */
      assets: ScoopFeeAssetLine[];
    };
    creator: {
      label: 'creator';
      assets: ScoopFeeAssetLine[];
    };
  };
};

function ethLikeDecimals(assetKind: string, assetAddress: string): number {
  return assetKind === 'eth' || assetAddress.endsWith('000000000000000000000000')
    ? DEFAULT_QUOTE_DECIMALS
    : 18;
}

function feeSymbol(assetKind: string): string {
  return assetKind === 'eth' ? 'ETH' : 'TOKEN';
}

export async function getScoopProfile(
  db: Queryable,
  userId: string,
): Promise<ScoopProfileRecord | null> {
  const result = await db.query<{
    user_id: string;
    display_name: string | null;
    avatar_path: string | null;
    profile_created_at: Date;
    joined_at: Date;
    status: string;
  }>(
    `SELECT
       u.id AS user_id,
       u.status,
       u.created_at AS joined_at,
       p.display_name,
       p.avatar_path,
       p.created_at AS profile_created_at
     FROM scoop_users u
     LEFT JOIN scoop_profiles p ON p.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    createdAt: new Date(row.profile_created_at ?? row.joined_at).toISOString(),
    joinedAt: new Date(row.joined_at).toISOString(),
    status: row.status,
  };
}

export async function updateScoopDisplayName(
  db: Queryable,
  userId: string,
  displayName: string | null,
): Promise<ScoopProfileRecord | null> {
  const trimmed =
    displayName == null ? null : displayName.trim().slice(0, 48) || null;
  await db.query(
    `INSERT INTO scoop_profiles (user_id, display_name, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       updated_at = NOW()`,
    [userId, trimmed],
  );
  return getScoopProfile(db, userId);
}

export async function updateScoopAvatarPath(
  db: Queryable,
  userId: string,
  avatarPath: string | null,
): Promise<ScoopProfileRecord | null> {
  await db.query(
    `INSERT INTO scoop_profiles (user_id, avatar_path, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       avatar_path = EXCLUDED.avatar_path,
       updated_at = NOW()`,
    [userId, avatarPath],
  );
  return getScoopProfile(db, userId);
}

export async function getPrimaryWalletForUser(
  db: Queryable,
  userId: string,
  sessionAddress?: string,
): Promise<ScoopAccountWallet | null> {
  const preferred = sessionAddress ? normalizeAddress(sessionAddress) : null;
  const result = await db.query<{
    address: string;
    wallet_type: ScoopWalletType;
    provider: ScoopWalletProvider;
    is_primary: boolean;
  }>(
    `SELECT address, wallet_type, provider, is_primary
     FROM scoop_wallets
     WHERE user_id = $1
     ORDER BY
       CASE WHEN $2::text IS NOT NULL AND address = $2 THEN 0 ELSE 1 END,
       is_primary DESC,
       last_seen_at DESC
     LIMIT 1`,
    [userId, preferred],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    address: row.address,
    walletType: row.wallet_type,
    provider: row.provider,
    isPrimary: row.is_primary,
  };
}

/**
 * Tokens launched by this canonical user.
 * Attribution: launches.deployer_address → scoop_wallets.address → user_id.
 * Does NOT use creator_id as the ownership key (deployer ≠ creator identity).
 */
export async function listLaunchesForScoopUser(
  db: Queryable,
  userId: string,
  chainId: number,
): Promise<ScoopAccountLaunch[]> {
  const result = await db.query<{
    chain_id: number;
    token_address: string;
    name: string;
    symbol: string;
    image_uri: string | null;
    display_image_url: string | null;
    quote_asset: string;
    launched_at: string | number;
    launch_complete: boolean | null;
    creator_id: string;
  }>(
    `SELECT
       l.chain_id,
       l.token_address,
       t.name,
       t.symbol,
       t.image_uri,
       t.display_image_url,
       l.quote_asset,
       l.launched_at,
       COALESCE(m.launch_complete, FALSE) AS launch_complete,
       l.creator_id
     FROM scoop_wallets w
     INNER JOIN launches l
       ON l.deployer_address = w.address AND l.chain_id = $2
     INNER JOIN tokens t
       ON t.chain_id = l.chain_id AND t.token_address = l.token_address
     LEFT JOIN token_market_state m
       ON m.chain_id = l.chain_id AND m.token_address = l.token_address
     WHERE w.user_id = $1
     ORDER BY l.launched_at DESC
     LIMIT 100`,
    [userId, chainId],
  );

  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    tokenAddress: String(row.token_address),
    name: String(row.name),
    symbol: String(row.symbol),
    imageUri: row.image_uri ? String(row.image_uri) : null,
    displayImageUrl:
      row.display_image_url == null || String(row.display_image_url).trim() === ''
        ? null
        : String(row.display_image_url),
    quoteAsset: String(row.quote_asset),
    launchedAt: Number(row.launched_at),
    launchComplete: Boolean(row.launch_complete),
    creatorId: String(row.creator_id),
  }));
}

/**
 * Lifetime deployer fee accruals from fee_distributions.deployer_raw.
 * No claimable/claimed layer exists in the indexer today — do not invent one.
 */
export async function getDeployerFeeTotalsForScoopUser(
  db: Queryable,
  userId: string,
  chainId: number,
): Promise<ScoopFeeAssetLine[]> {
  const result = await db.query<{
    asset_kind: string;
    asset_address: string;
    amount_raw: string;
  }>(
    `SELECT
       fd.asset_kind,
       fd.asset_address,
       SUM(fd.deployer_raw)::text AS amount_raw
     FROM scoop_wallets w
     INNER JOIN launches l
       ON l.deployer_address = w.address AND l.chain_id = $2
     INNER JOIN fee_distributions fd
       ON fd.chain_id = l.chain_id
      AND fd.scooptoken_address = l.token_address
     WHERE w.user_id = $1
     GROUP BY fd.asset_kind, fd.asset_address
     ORDER BY fd.asset_kind, fd.asset_address`,
    [userId, chainId],
  );

  return result.rows.map((row) => {
    const amountRaw = String(row.amount_raw);
    const decimals = ethLikeDecimals(String(row.asset_kind), String(row.asset_address));
    return {
      assetKind: String(row.asset_kind),
      assetAddress: String(row.asset_address),
      symbol: feeSymbol(String(row.asset_kind)),
      amountRaw,
      amountDisplay: formatRawAmount(amountRaw, decimals),
    };
  });
}

/**
 * Creator fees for creator_ids whose creators.wallet_address matches the user's wallets.
 * Keeps claimable / credited / claimed separate from deployer fee totals.
 */
export async function getCreatorFeeTotalsForScoopUser(
  db: Queryable,
  userId: string,
  chainId: number,
): Promise<ScoopFeeAssetLine[]> {
  const result = await db.query<{
    asset_kind: string;
    asset_address: string;
    claimable_raw: string;
    credited_raw: string;
    claimed_raw: string;
    token_symbol: string | null;
    token_name: string | null;
    token_decimals: number | null;
    display_image_url: string | null;
    image_uri: string | null;
  }>(
    `WITH user_creators AS (
       SELECT DISTINCT c.creator_id
       FROM scoop_wallets w
       INNER JOIN creators c
         ON c.wallet_address = w.address AND c.chain_id = $2
       WHERE w.user_id = $1
     )
     SELECT
       ccs.asset_kind,
       ccs.asset_address,
       SUM(ccs.claimable_raw)::text AS claimable_raw,
       SUM(COALESCE(cred.credited_raw, 0))::text AS credited_raw,
       SUM(COALESCE(cl.claimed_raw, 0))::text AS claimed_raw,
       MAX(t.symbol) AS token_symbol,
       MAX(t.name) AS token_name,
       MAX(t.decimals) AS token_decimals,
       COALESCE(
         NULLIF(MAX(t.display_image_url), ''),
         NULLIF(MAX(q.image_url), '')
       ) AS display_image_url,
       MAX(t.image_uri) AS image_uri
     FROM user_creators uc
     INNER JOIN creator_claimable_state ccs
       ON ccs.chain_id = $2 AND ccs.creator_id = uc.creator_id
     LEFT JOIN tokens t
       ON t.chain_id = ccs.chain_id
      AND lower(t.token_address) = lower(ccs.asset_address)
     LEFT JOIN public_quote_catalogue q
       ON q.chain_id = ccs.chain_id
      AND lower(q.quote_asset) = lower(ccs.asset_address)
      AND q.is_enabled
     LEFT JOIN LATERAL (
       SELECT SUM(amount_raw) AS credited_raw
       FROM creator_credits
       WHERE chain_id = ccs.chain_id
         AND creator_id = ccs.creator_id
         AND asset_kind = ccs.asset_kind
         AND asset_address = ccs.asset_address
     ) cred ON TRUE
     LEFT JOIN LATERAL (
       SELECT SUM(amount_raw) AS claimed_raw
       FROM creator_claims
       WHERE chain_id = ccs.chain_id
         AND creator_id = ccs.creator_id
         AND asset_kind = ccs.asset_kind
         AND asset_address = ccs.asset_address
     ) cl ON TRUE
     GROUP BY ccs.asset_kind, ccs.asset_address
     ORDER BY ccs.asset_kind, ccs.asset_address`,
    [userId, chainId],
  );

  return result.rows.map((row) => {
    const claimableRaw = String(row.claimable_raw);
    const creditedRaw = String(row.credited_raw);
    const claimedRaw = String(row.claimed_raw);
    const isEth = String(row.asset_kind) === 'eth';
    const decimals =
      isEth
        ? DEFAULT_QUOTE_DECIMALS
        : row.token_decimals != null && Number(row.token_decimals) > 0
          ? Number(row.token_decimals)
          : ethLikeDecimals(String(row.asset_kind), String(row.asset_address));
    const symbol = isEth
      ? 'ETH'
      : row.token_symbol && String(row.token_symbol).trim() !== ''
        ? String(row.token_symbol)
        : feeSymbol(String(row.asset_kind));
    const displayImageUrl =
      row.display_image_url == null || String(row.display_image_url).trim() === ''
        ? null
        : String(row.display_image_url);
    const imageUri =
      row.image_uri == null || String(row.image_uri).trim() === ''
        ? null
        : String(row.image_uri);
    return {
      assetKind: String(row.asset_kind),
      assetAddress: String(row.asset_address),
      symbol,
      name: isEth ? 'Ethereum' : row.token_name,
      decimals,
      displayImageUrl,
      imageUri,
      amountRaw: creditedRaw,
      amountDisplay: formatRawAmount(creditedRaw, decimals),
      claimableRaw,
      claimableDisplay: formatRawAmount(claimableRaw, decimals),
      creditedRaw,
      claimedRaw,
      claimedDisplay: formatRawAmount(claimedRaw, decimals),
    };
  });
}

export async function getScoopAccountBundle(
  db: Queryable,
  userId: string,
  chainId: number,
  sessionAddress: string,
): Promise<ScoopAccountBundle | null> {
  const user = await getScoopProfile(db, userId);
  if (!user || user.status !== 'active') return null;
  const wallet = await getPrimaryWalletForUser(db, userId, sessionAddress);
  if (!wallet) return null;

  const [tokensLaunched, deployerAssets, creatorAssets] = await Promise.all([
    listLaunchesForScoopUser(db, userId, chainId),
    getDeployerFeeTotalsForScoopUser(db, userId, chainId),
    getCreatorFeeTotalsForScoopUser(db, userId, chainId),
  ]);

  return {
    user,
    wallet,
    tokensLaunched,
    fees: {
      deployer: { label: 'deployer', assets: deployerAssets },
      creator: { label: 'creator', assets: creatorAssets },
    },
  };
}
