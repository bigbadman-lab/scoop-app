import { describe, expect, it, afterEach } from 'vitest';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  loadPumpSdk,
  resetPumpSdkCacheForTests,
} from '@/lib/launch/adapters/pump/sdk';
import { buildPumpCreateInstruction } from '@/lib/launch/adapters/pump/build-create';

const CREATOR = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const URI = 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

describe('loadPumpSdk (server require)', () => {
  afterEach(() => {
    resetPumpSdkCacheForTests();
  });

  it('loads createV2Instruction via string-literal require', () => {
    const mod = loadPumpSdk();
    expect(typeof mod.PUMP_SDK.createV2Instruction).toBe('function');
    expect(mod.PUMP_PROGRAM_ID.toBase58()).toMatch(/^6EF8/);
  });
});

describe('Pump prepare build + client round-trip (no broadcast)', () => {
  it('builds, serializes to base64, deserializes, and mint-partial-signs', async () => {
    const mint = Keypair.generate();
    const prepared = await buildPumpCreateInstruction({
      name: 'Prepare Fix',
      symbol: 'PFIX',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint: mint.publicKey.toBase58(),
    });

    const tx = new Transaction();
    tx.feePayer = new PublicKey(prepared.user);
    tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
    tx.add(prepared.instruction);

    const transactionBase64 = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString('base64');

    expect(transactionBase64.length).toBeGreaterThan(64);

    const restored = Transaction.from(Buffer.from(transactionBase64, 'base64'));
    restored.partialSign(mint);
    expect(
      restored.signatures.some(
        (sig) =>
          sig.publicKey.equals(mint.publicKey) && sig.signature != null,
      ),
    ).toBe(true);

    // Wallet signature is still missing — serialize for broadcast must stay soft.
    const soft = restored.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    expect(soft.byteLength).toBeGreaterThan(64);
  });
});
