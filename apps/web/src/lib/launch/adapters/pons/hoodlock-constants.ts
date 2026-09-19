/**
 * HoodLock constants for browser Pons lock flow (Gate 5).
 */
export {
  HOODLOCK_CHAIN_ID,
  HOODLOCK_LOCKER_ADDRESS,
  HOODLOCK_LOCKER_ADDRESS_LOWER,
} from '@scoop/shared';

/** Conservative ETH headroom for gas when checking lock fee affordability. */
export const HOODLOCK_GAS_HEADROOM_WEI = BigInt('2000000000000000'); // 0.002 ETH

export const ERC20_MAX_UINT256 = (BigInt(2) ** BigInt(256)) - BigInt(1);
