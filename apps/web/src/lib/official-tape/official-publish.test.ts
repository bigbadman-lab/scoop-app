import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { toOfficialTapePublic } from '@/lib/official-tape/load-official-tape-public';
import type { OfficialTapeSolanaConfig } from '@/lib/official-tape/official-config';
import { OFFICIAL_TAPE_DEPLOYER } from '@/lib/official-tape/constants';

describe('official:publish safety', () => {
  it('publish CLI source never calls Streamflow create/lock broadcast helpers', () => {
    const src = readFileSync(
      join(process.cwd(), 'scripts/official-publish.mts'),
      'utf8',
    );
    expect(src).not.toMatch(/createLock/);
    expect(src).not.toMatch(/buildOfficialTapeLockStreamParams/);
    expect(src).not.toMatch(/loadOfficialTapeDeployerKeypair/);
    expect(src).toMatch(/Does NOT require SOLANA_KEYPAIR_PATH/);
    expect(src).toMatch(/importKind:\s*'official'/);
    expect(src).toMatch(/verifyExistingOfficialStreamflowLock/);
  });

  it('maps verified config to public announcement fields', () => {
    const config: OfficialTapeSolanaConfig = {
      chainFamily: 'solana',
      chainId: 900001,
      marketSource: 'pump',
      mint: '9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump',
      symbol: 'TAPE',
      deployer: OFFICIAL_TAPE_DEPLOYER,
      lockProvider: 'streamflow',
      lockVerified: true,
      lockId: 'Lock111111111111111111111111111111111111111',
      lockSignature: null,
      unlockAt: '2026-09-22T12:00:00.000Z',
      lockAmountRaw: '1000',
      registeredAt: '2026-03-22T12:00:00.000Z',
      lockBadgeCopy: 'DEV TOKENS LOCKED 6 MONTHS',
    };
    const pub = toOfficialTapePublic(config);
    expect(pub.mint).toBe('9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump');
    expect(pub.lockBadgeCopy).toBe('DEV TOKENS LOCKED 6 MONTHS');
    expect(pub.tokenHref).toBe('/token/9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump');
  });

  it('hides lock badge when lockVerified is false', () => {
    const pub = toOfficialTapePublic({
      chainFamily: 'solana',
      chainId: 900001,
      marketSource: 'pump',
      mint: '9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump',
      symbol: 'TAPE',
      deployer: OFFICIAL_TAPE_DEPLOYER,
      lockProvider: 'streamflow',
      lockVerified: false,
      lockId: null,
      lockSignature: null,
      unlockAt: null,
      lockAmountRaw: null,
      registeredAt: new Date().toISOString(),
    });
    expect(pub.lockBadgeCopy).toBeNull();
  });
});
