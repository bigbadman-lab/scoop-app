import { describe, expect, it } from 'vitest';
import {
  CANONICAL_CHAIN_ID,
  scoopV1MainnetCanaryManifest,
  validateManifest,
} from '../src/index.js';

describe('@scoop/contracts manifest', () => {
  it('uses chain ID 4663', () => {
    expect(scoopV1MainnetCanaryManifest.chainId).toBe(4663);
    expect(CANONICAL_CHAIN_ID).toBe(4663);
  });

  it('matches canonical Factory address', () => {
    expect(scoopV1MainnetCanaryManifest.contracts.ScoopFactory).toBe(
      '0x15E874Bc667435ddbF2a67c0362701DC23C90833',
    );
  });

  it('matches HELLO golden fixture', () => {
    expect(scoopV1MainnetCanaryManifest.fixtures.hello.token).toBe(
      '0x2284ed0e4d446c6D78aC2d49a68BAE822Fd87373',
    );
    expect(scoopV1MainnetCanaryManifest.fixtures.hello.poolId).toBe(
      '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc',
    );
    expect(scoopV1MainnetCanaryManifest.fixtures.hello.launchBlock).toBe(55863290);
  });

  it('rejects wrong chain ID', () => {
    expect(() =>
      validateManifest({
        ...scoopV1MainnetCanaryManifest,
        chainId: 1,
      }),
    ).toThrow(/chainId/);
  });
});
