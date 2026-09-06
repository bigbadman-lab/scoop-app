/** Lowercase 0x-prefixed address (20 bytes). */
export type HexAddress = `0x${string}`;

/** Lowercase 0x-prefixed bytes32. */
export type HexBytes32 = `0x${string}`;

export function normalizeAddress(address: string): HexAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`Invalid address: ${address}`);
  }
  return address.toLowerCase() as HexAddress;
}

export function normalizeBytes32(value: string): HexBytes32 {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`Invalid bytes32: ${value}`);
  }
  return value.toLowerCase() as HexBytes32;
}

/** Decimal digit string for NUMERIC / bigint columns — never Number(). */
export function toNumericString(value: bigint | number | string): string {
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`Non-integer number cannot become NUMERIC: ${value}`);
    }
    return BigInt(value).toString(10);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Invalid numeric string: ${value}`);
  }
  return trimmed;
}
