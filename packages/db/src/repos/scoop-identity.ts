import { withTransaction } from '../client.js';
import type { Pool, Queryable } from '../types.js';
import { normalizeAddress, type HexAddress } from '../hex.js';

export type ScoopUserStatus = 'active' | 'disabled';
export type ScoopWalletType = 'external' | 'embedded';
export type ScoopWalletProvider =
  | 'injected'
  | 'walletconnect'
  | 'reown_email'
  | 'auth'
  | 'unknown'
  | null;

export type ScoopUserRecord = {
  userId: string;
  status: ScoopUserStatus;
  address: HexAddress;
  walletId: string;
  walletType: ScoopWalletType;
  isPrimary: boolean;
};

export type ResolveScoopUserInput = {
  address: string;
  /** Metadata only — never an authorization input. Defaults: external / unknown. */
  walletType?: ScoopWalletType;
  provider?: ScoopWalletProvider;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

async function loadUserByWalletAddress(
  db: Queryable,
  address: HexAddress,
): Promise<ScoopUserRecord | null> {
  const result = await db.query<{
    user_id: string;
    status: ScoopUserStatus;
    wallet_id: string;
    wallet_type: ScoopWalletType;
    is_primary: boolean;
    address: string;
  }>(
    `SELECT
       u.id AS user_id,
       u.status,
       w.id AS wallet_id,
       w.wallet_type,
       w.is_primary,
       w.address
     FROM scoop_wallets w
     INNER JOIN scoop_users u ON u.id = w.user_id
     WHERE w.address = $1
     LIMIT 1`,
    [address],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    status: row.status,
    address: row.address as HexAddress,
    walletId: row.wallet_id,
    walletType: row.wallet_type,
    isPrimary: row.is_primary,
  };
}

async function touchWalletLastSeen(db: Queryable, walletId: string): Promise<void> {
  await db.query(`UPDATE scoop_wallets SET last_seen_at = NOW() WHERE id = $1`, [
    walletId,
  ]);
}

async function assertActive(user: ScoopUserRecord): Promise<ScoopUserRecord> {
  if (user.status !== 'active') {
    throw new Error('SCOOP_USER_DISABLED');
  }
  return user;
}

async function createCanonicalIdentity(
  db: Queryable,
  address: HexAddress,
  walletType: ScoopWalletType,
  provider: ScoopWalletProvider,
): Promise<ScoopUserRecord> {
  const userInsert = await db.query<{ id: string; status: ScoopUserStatus }>(
    `INSERT INTO scoop_users (status) VALUES ('active')
     RETURNING id, status`,
  );
  const user = userInsert.rows[0];
  if (!user) {
    throw new Error('Failed to create scoop_user');
  }

  const walletInsert = await db.query<{
    id: string;
    wallet_type: ScoopWalletType;
    is_primary: boolean;
    address: string;
  }>(
    `INSERT INTO scoop_wallets (
       user_id, address, chain_family, wallet_type, provider, is_primary
     ) VALUES ($1, $2, 'eip155', $3, $4, TRUE)
     RETURNING id, wallet_type, is_primary, address`,
    [user.id, address, walletType, provider],
  );
  const wallet = walletInsert.rows[0];
  if (!wallet) {
    throw new Error('Failed to create scoop_wallet');
  }

  await db.query(
    `INSERT INTO scoop_profiles (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id],
  );

  return {
    userId: user.id,
    status: user.status,
    address: wallet.address as HexAddress,
    walletId: wallet.id,
    walletType: wallet.wallet_type,
    isPrimary: wallet.is_primary,
  };
}

/**
 * Resolve or create the canonical SCOOP user for a verified SIWE wallet.
 * Transaction + unique(address) guard concurrent first logins.
 */
export async function resolveOrCreateScoopUserForVerifiedWallet(
  pool: Pool,
  input: ResolveScoopUserInput,
): Promise<ScoopUserRecord> {
  const address = normalizeAddress(input.address);
  const walletType = input.walletType ?? 'external';
  const provider = input.provider === undefined ? 'unknown' : input.provider;

  try {
    return await withTransaction(pool, async (client) => {
      const existing = await loadUserByWalletAddress(client, address);
      if (existing) {
        await assertActive(existing);
        await touchWalletLastSeen(client, existing.walletId);
        if (input.walletType || input.provider !== undefined) {
          await client.query(
            `UPDATE scoop_wallets
             SET wallet_type = COALESCE($2, wallet_type),
                 provider = COALESCE($3, provider),
                 last_seen_at = NOW()
             WHERE id = $1`,
            [
              existing.walletId,
              input.walletType ?? null,
              input.provider === undefined ? null : input.provider,
            ],
          );
          return {
            ...existing,
            walletType: input.walletType ?? existing.walletType,
          };
        }
        return existing;
      }
      return createCanonicalIdentity(client, address, walletType, provider);
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return withTransaction(pool, async (client) => {
      const raced = await loadUserByWalletAddress(client, address);
      if (!raced) throw error;
      await assertActive(raced);
      await touchWalletLastSeen(client, raced.walletId);
      return raced;
    });
  }
}

export async function findScoopUserByWalletAddress(
  db: Queryable,
  address: string,
): Promise<ScoopUserRecord | null> {
  return loadUserByWalletAddress(db, normalizeAddress(address));
}
