import { describe, expect, it } from 'vitest';
import {
  parseProtocolResetArgs,
} from './reset-protocol.js';
import {
  canonicalProductionManifest,
  isCanonicalProductionDeployed,
} from '@scoop/contracts';

describe('protocol reset tooling', () => {
  it('parses dry-run historical-test args', () => {
    const opts = parseProtocolResetArgs([
      '--mode',
      'historical-test',
      '--chain-id',
      '4663',
    ]);
    expect(opts.apply).toBe(false);
    expect(opts.mode).toBe('historical-test');
    expect(opts.chainId).toBe(4663);
  });

  it('rejects missing mode', () => {
    expect(() => parseProtocolResetArgs(['--chain-id', '4663'])).toThrow(/mode/);
  });

  it('canonical production remains undeployed (no silent historical Factory)', () => {
    expect(isCanonicalProductionDeployed(canonicalProductionManifest)).toBe(false);
    expect(canonicalProductionManifest.contracts).toBeNull();
  });
});
