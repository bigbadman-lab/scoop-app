/**
 * TGE finalizer constants (Robinhood Chain / HoodLock).
 * Code-hash is the forensically approved runtime; rehearsal re-verifies live.
 */

export const ROBINHOOD_CHAIN_ID = 4663;

/** Canonical HoodLock RobinhoodLocker (forensic gate passed). */
export const HOODLOCK_LOCKER_ADDRESS =
  '0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F';

/** SHA-256 of deployed runtime bytecode (hex, no 0x). */
export const HOODLOCK_APPROVED_CODE_SHA256 =
  '00da4abbf3346b85776997ab2bda43d07a35970a16819478523f3249d7cd4cf4';

/** Canonical production ScoopFactory (launchAndBuy / InitialBuyExecuted). */
export const SCOOP_FACTORY_ADDRESS =
  '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C';

/**
 * Canonical TGE policy: lock 100% of the launch dev-buy TAPE for at least this
 * many calendar months. Not operator-overridable in the normal finalizer path.
 */
export const TGE_DEV_BUY_LOCK_CALENDAR_MONTHS = 6;

/**
 * Safety margin (seconds) added when proposing unlockTime so a slightly later
 * mined block.timestamp cannot produce a lock shorter than
 * TGE_DEV_BUY_LOCK_CALENDAR_MONTHS relative to the lock-time reference used in
 * post-receipt verification.
 */
export const TGE_UNLOCK_SAFETY_MARGIN_SECONDS = 300;

/**
 * Hard TGE safety ceiling for HoodLock live fee().
 * Transaction value remains the live fee when under this limit.
 * Never silently clamp; never send max when live fee is lower.
 * Observed historical fee: 0.005 ETH. Ceiling: 0.01 ETH.
 */
export const HOODLOCK_TGE_MAX_FEE_WEI = 10_000_000_000_000_000n; // 0.01 ETH

/** Env var name for the TGE finalizer signer (value never committed / never logged). */
export const TAPE_TGE_SIGNER_PRIVATE_KEY_ENV = 'TAPE_TGE_SIGNER_PRIVATE_KEY';

export const TAPE_OFFICIAL_CONTRACT_KEY = 'tape_official_contract';

export const BLOCKSCOUT_ADDRESS_URL =
  'https://robinhoodchain.blockscout.com/address';
