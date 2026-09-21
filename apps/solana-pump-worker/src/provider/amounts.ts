/**
 * Integer-safe decimal helpers for Solana trade amounts (no float math).
 */

/** Convert a non-negative decimal string to integer raw units. */
export function decimalStringToRaw(decimal: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(decimal)) {
    throw new Error(`invalid decimal: ${decimal}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const [wholePart, fracPart = ''] = decimal.split('.');
  const fracPadded = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  return `${wholePart}${fracPadded}`.replace(/^0+(?=\d)/, '') || '0';
}

/** Convert non-negative integer raw units to a decimal string. */
export function rawToDecimalString(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid raw amount: ${raw}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  if (decimals === 0) return raw.replace(/^0+(?=\d)/, '') || '0';
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '') || '0';
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac}` : whole;
}

/** price = sol / tokens as decimal string (fail if tokens == 0). */
export function priceSolFromAmounts(solAmount: string, tokenAmount: string): string {
  const solRaw = decimalStringToRaw(solAmount, 18);
  const tokRaw = decimalStringToRaw(tokenAmount, 18);
  const sol = BigInt(solRaw);
  const tok = BigInt(tokRaw);
  if (tok === 0n) {
    throw new Error('tokenAmount is zero');
  }
  const priceX18 = (sol * 10n ** 18n) / tok;
  const whole = priceX18 / 10n ** 18n;
  const frac = priceX18 % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}
