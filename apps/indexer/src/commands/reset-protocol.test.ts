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

  it('canonical production is deployed with Factory and start block', () => {
    expect(isCanonicalProductionDeployed(canonicalProductionManifest)).toBe(true);
    expect(canonicalProductionManifest.contracts?.factory.toLowerCase()).toBe(
      '0x4b227d5e6199f42cea4e638875ff8c740757dd3c',
    );
    expect(canonicalProductionManifest.metadata.indexingStartBlock).toBe(
      60525572,
    );
  });
});
