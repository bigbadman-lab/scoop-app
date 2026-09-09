/**
 * Creator identity tests — vectors cross-checked against scoop-protocol.
 *
 * Protocol refs:
 * - ScoopCreatorRegistry.sol walletCreatorId / xCreatorId
 * - ScoopCreatorRegistry.t.sol test_walletCreatorId_deterministic, test_xCreatorId_deterministic,
 *   test_walletAndXDomainsDoNotCollideForIdenticalLookingValues
 * - ScoopHelloCanaryLaunch.sol EXPECTED_HELLO_CREATOR / EXPECTED_CREATOR_ID
 */
import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, zeroAddress } from 'viem';
import {
  CreatorType,
  InvalidCreatorIdentityError,
  isZeroCreatorId,
  parseXUserId,
  walletCreatorId,
  xCreatorId,
} from '@/lib/launch/creator-id';

/** HELLO canary — ScoopHelloCanaryLaunch.EXPECTED_* */
const HELLO_CREATOR = '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C' as const;
const HELLO_CREATOR_ID =
  '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef' as const;

/** Protocol test constant X_USER_A = 123456789 */
const X_USER_A = 123456789n;
const X_USER_B = 987654321n;

function independentWalletId(wallet: `0x${string}`) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint8' },
        { type: 'address' },
      ],
      [CreatorType.Wallet, wallet],
    ),
  );
}

function independentXId(xUserId: bigint) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint8' },
        { type: 'uint256' },
      ],
      [CreatorType.X, xUserId],
    ),
  );
}

describe('walletCreatorId', () => {
  it('matches HELLO production canary creatorId (ScoopHelloCanaryLaunch)', () => {
    expect(walletCreatorId(HELLO_CREATOR).toLowerCase()).toBe(HELLO_CREATOR_ID);
  });

  it('matches independent abi.encode(Wallet, address) construction', () => {
    const a = '0x1111111111111111111111111111111111111111' as const;
    expect(walletCreatorId(a)).toBe(independentWalletId(a));
  });

  it('is deterministic and case-insensitive for address', () => {
    const mixed = '0x35affbccc92add3fab6b515326da1433dca7cf9c';
    expect(walletCreatorId(mixed)).toBe(walletCreatorId(HELLO_CREATOR));
    expect(walletCreatorId(HELLO_CREATOR)).toBe(walletCreatorId(HELLO_CREATOR));
  });

  it('different wallets → different creatorIds', () => {
    const a = '0x1111111111111111111111111111111111111111';
    const b = '0x2222222222222222222222222222222222222222';
    expect(walletCreatorId(a)).not.toBe(walletCreatorId(b));
  });

  it('rejects zero address', () => {
    expect(() => walletCreatorId(zeroAddress)).toThrow(InvalidCreatorIdentityError);
  });

  it('rejects invalid address', () => {
    expect(() => walletCreatorId('0x123')).toThrow(InvalidCreatorIdentityError);
    expect(() => walletCreatorId('not-an-address')).toThrow(InvalidCreatorIdentityError);
  });

  it('output is 32 bytes (66-char hex)', () => {
    const id = walletCreatorId(HELLO_CREATOR);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(isZeroCreatorId(id)).toBe(false);
  });

  it('includes Wallet type discriminator (≠ encode of address alone)', () => {
    const wallet = '0x1111111111111111111111111111111111111111' as const;
    const withoutType = keccak256(
      encodeAbiParameters([{ type: 'address' }], [wallet]),
    );
    expect(walletCreatorId(wallet)).not.toBe(withoutType);
  });
});

describe('xCreatorId', () => {
  it('matches independent abi.encode(X, uint256) for protocol X_USER_A', () => {
    // ScoopCreatorRegistry.t.sol X_USER_A = 123456789
    expect(xCreatorId(X_USER_A)).toBe(independentXId(X_USER_A));
    expect(xCreatorId('123456789')).toBe(independentXId(X_USER_A));
  });

  it('is deterministic', () => {
    expect(xCreatorId(X_USER_A)).toBe(xCreatorId(123456789));
    expect(xCreatorId(X_USER_A)).toBe(xCreatorId('123456789'));
  });

  it('different X user IDs → different creatorIds', () => {
    expect(xCreatorId(X_USER_A)).not.toBe(xCreatorId(X_USER_B));
  });

  it('wallet and X domains do not collide for identical-looking values', () => {
    // Mirrors test_walletAndXDomainsDoNotCollideForIdenticalLookingValues
    const wallet = '0x1111111111111111111111111111111111111111' as const;
    const mirrored = BigInt(wallet);
    expect(walletCreatorId(wallet)).not.toBe(xCreatorId(mirrored));
  });

  it('accepts large uint256-compatible X ID', () => {
    const large = (1n << 200n) + 77n;
    const id = xCreatorId(large);
    expect(id).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(id).toBe(independentXId(large));
  });

  it('rejects invalid / non-numeric / handle-like IDs at app boundary', () => {
    expect(() => parseXUserId('')).toThrow(InvalidCreatorIdentityError);
    expect(() => parseXUserId('0')).toThrow(InvalidCreatorIdentityError);
    expect(() => parseXUserId('@scoop')).toThrow(InvalidCreatorIdentityError);
    expect(() => parseXUserId('scoopterminal')).toThrow(InvalidCreatorIdentityError);
    expect(() => parseXUserId('0x1234')).toThrow(InvalidCreatorIdentityError);
    expect(() => xCreatorId('@handle')).toThrow(InvalidCreatorIdentityError);
  });

  it('output is 32 bytes', () => {
    expect(xCreatorId(1)).toMatch(/^0x[0-9a-f]{64}$/i);
  });
});
