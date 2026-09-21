import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Keypair } from '@solana/web3.js';
import {
  assertMintHandleHasNoSecret,
  clearPumpMintAttempt,
  createPumpMintAttempt,
  getPumpMintKeypair,
  PUMP_CREATE_DEFAULTS,
  PUMP_FIELD_LIMITS,
  PUMP_PROGRAM_ID_MAINNET,
  projectPumpMetadataUri,
  replacePumpMintAttempt,
  TOKEN_2022_PROGRAM_ID,
  validatePumpCreateInput,
} from '@/lib/launch/adapters/pump/adapter';
import {
  buildPumpCreateInstruction,
  inspectCreateInstructionAccounts,
} from '@/lib/launch/adapters/pump/build-create';
import { PUMP_INITIAL_BUY_FEASIBILITY } from '@/lib/launch/adapters/pump/initial-buy';
import { pumpLaunchResult } from '@/lib/launch/launch-result';

const CREATOR = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const URI = 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

describe('Pump field validation', () => {
  it('enforces Pump name/symbol/uri limits and rejects EVM creator', () => {
    const mint = Keypair.generate().publicKey.toBase58();
    expect(
      validatePumpCreateInput({
        name: 'A'.repeat(33),
        symbol: 'OK',
        uri: URI,
        creator: CREATOR,
        user: CREATOR,
        mint,
      }).name,
    ).toMatch(/32/);
    expect(
      validatePumpCreateInput({
        name: 'Ok',
        symbol: 'S'.repeat(14),
        uri: URI,
        creator: CREATOR,
        user: CREATOR,
        mint,
      }).symbol,
    ).toMatch(/13/);
    expect(
      validatePumpCreateInput({
        name: 'Ok',
        symbol: 'OK',
        uri: 'x'.repeat(201),
        creator: CREATOR,
        user: CREATOR,
        mint,
      }).uri,
    ).toMatch(/200/);
    expect(
      validatePumpCreateInput({
        name: 'Ok',
        symbol: 'OK',
        uri: URI,
        creator: '0x0000000000000000000000000000000000000001',
        user: CREATOR,
        mint,
      }).creator,
    ).toBeTruthy();
  });

  it('accepts Gate B live wallet + SCOOP ipfs uri within limits', () => {
    const mint = Keypair.generate().publicKey.toBase58();
    expect(
      validatePumpCreateInput({
        name: 'Scoop Gate C',
        symbol: 'SGATEC',
        uri: URI,
        creator: CREATOR,
        user: CREATOR,
        mint,
      }),
    ).toEqual({});
    expect(URI.length).toBeLessThanOrEqual(PUMP_FIELD_LIMITS.uriMax);
  });
});

describe('Pump metadata projection', () => {
  it('reuses SCOOP ipfs image URI as create uri', () => {
    const projected = projectPumpMetadataUri({
      name: 'Scoop Gate C',
      symbol: 'SGATEC',
      scoopImageIpfsUri: URI,
    });
    expect(projected.reusedScoopIpfsUri).toBe(true);
    expect(projected.uri).toBe(URI);
    expect(projected.json.image).toBe(URI);
  });
});

describe('Mint keypair lifecycle', () => {
  it('exposes only public handle and keeps secret in memory', () => {
    const handle = createPumpMintAttempt();
    assertMintHandleHasNoSecret(handle);
    expect(getPumpMintKeypair(handle.attemptId)?.publicKey.toBase58()).toBe(
      handle.mintPublicKey,
    );
    const next = replacePumpMintAttempt(handle.attemptId);
    expect(getPumpMintKeypair(handle.attemptId)).toBeNull();
    expect(next.mintPublicKey).not.toBe(handle.mintPublicKey);
    clearPumpMintAttempt(next.attemptId);
  });
});

describe('Pump create instruction construction', () => {
  it('builds SOL-paired create_v2 with forced flags and expected programs', async () => {
    const mint = Keypair.generate();
    const prepared = await buildPumpCreateInstruction({
      name: 'Scoop Gate C',
      symbol: 'SGATEC',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint: mint.publicKey.toBase58(),
    });

    expect(prepared.mayhemMode).toBe(false);
    expect(prepared.holderReward).toBe(false);
    expect(prepared.cashback).toBe(false);
    expect(prepared.pair).toBe('SOL');
    expect(prepared.programId).toBe(PUMP_PROGRAM_ID_MAINNET);
    expect(PUMP_CREATE_DEFAULTS.mayhemMode).toBe(false);
    expect(PUMP_CREATE_DEFAULTS.holderReward).toBe(false);

    const checks = inspectCreateInstructionAccounts(prepared.instruction);
    expect(checks.pumpProgram).toBe(true);
    expect(checks.token2022).toBe(true);
    expect(checks.accountCount).toBe(16);
    expect(checks.mintIsSigner).toBe(true);
    expect(checks.userIsSigner).toBe(true);
    expect(checks.writableSigners).toContain(mint.publicKey.toBase58());
    expect(checks.writableSigners).toContain(CREATOR);
    expect(TOKEN_2022_PROGRAM_ID).toMatch(/^Tokenz/);
  });
});

describe('Launch result shape', () => {
  it('returns solana/pump mint + signature', () => {
    const result = pumpLaunchResult({
      mint: CREATOR,
      signature: '5'.repeat(64),
      uri: URI,
    });
    expect(result).toEqual({
      chain: 'solana',
      provider: 'pump',
      assetAddress: CREATOR,
      txHash: '5'.repeat(64),
      meta: { pair: 'SOL', uri: URI },
    });
  });
});

describe('Initial buy recommendation', () => {
  it('recommends CREATE_OR_CREATE_AND_BUY via official atomic helper', () => {
    expect(PUMP_INITIAL_BUY_FEASIBILITY.recommendation).toBe(
      'CREATE_OR_CREATE_AND_BUY',
    );
    expect(PUMP_INITIAL_BUY_FEASIBILITY.officialAtomicHelper).toBe(
      'createV2AndBuyInstructions',
    );
  });
});

describe('Pump adapter isolation', () => {
  it('does not import EVM stack from pump adapter sources', () => {
    const dir = path.join(
      process.cwd(),
      'src/lib/launch/adapters/pump',
    );
    const files = [
      'adapter.ts',
      'build-create.ts',
      'metadata.ts',
      'validation.ts',
      'types.ts',
      'mint-lifecycle.ts',
      'simulate.ts',
      'initial-buy.ts',
      'sdk.ts',
      'probe-flag.ts',
    ];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), 'utf8');
      expect(src).not.toMatch(/\bviem\b/);
      expect(src).not.toMatch(/\bwagmi\b/);
      expect(src).not.toMatch(/robinhood/i);
      expect(src).not.toMatch(/hoodlock/i);
      expect(src).not.toMatch(/uniswap/i);
    }
  });
});
