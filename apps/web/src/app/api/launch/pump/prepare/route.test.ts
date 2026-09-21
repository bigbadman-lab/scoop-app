import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@solana/web3.js';

const CREATOR = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const URI = 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

const getBalance = vi.fn();
const getLatestBlockhash = vi.fn();
const createSolanaConnection = vi.fn(() => ({
  getBalance,
  getLatestBlockhash,
}));

vi.mock('@/lib/solana/rpc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/solana/rpc')>(
    '@/lib/solana/rpc',
  );
  return {
    ...actual,
    createSolanaConnection,
  };
});

describe('POST /api/launch/pump/prepare', () => {
  beforeEach(() => {
    vi.resetModules();
    getBalance.mockReset();
    getLatestBlockhash.mockReset();
    createSolanaConnection.mockClear();
    createSolanaConnection.mockImplementation(() => ({
      getBalance,
      getLatestBlockhash,
    }));
  });

  async function post(body: unknown) {
    const { POST } = await import('@/app/api/launch/pump/prepare/route');
    return POST(
      new Request('http://localhost/api/launch/pump/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }

  it('rejects malformed mint with controlled 400', async () => {
    const res = await post({
      name: 'X',
      symbol: 'X',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint: 'not-a-pubkey',
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      ok: false;
      error: string;
      stage: string;
    };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('validation_failed');
    expect(json.stage).toBe('validate');
    expect(getBalance).not.toHaveBeenCalled();
  });

  it('returns controlled insufficient_sol before SDK build', async () => {
    getBalance.mockResolvedValue(0);
    const mint = Keypair.generate().publicKey.toBase58();
    const res = await post({
      name: 'X',
      symbol: 'X',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint,
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as {
      ok: false;
      error: string;
      stage: string;
      lamports: number;
    };
    expect(json.error).toBe('insufficient_sol');
    expect(json.stage).toBe('balance_gate');
    expect(json.lamports).toBe(0);
    expect(getLatestBlockhash).not.toHaveBeenCalled();
  });

  it('maps balance RPC failure to solana_rpc_balance_failed', async () => {
    getBalance.mockRejectedValue(new Error('upstream timeout'));
    const mint = Keypair.generate().publicKey.toBase58();
    const res = await post({
      name: 'X',
      symbol: 'X',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint,
    });
    expect(res.status).toBe(502);
    const json = (await res.json()) as {
      ok: false;
      error: string;
      stage: string;
      requestId: string;
    };
    expect(json.error).toBe('solana_rpc_balance_failed');
    expect(json.stage).toBe('get_balance');
    expect(json.requestId).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
  });

  it('maps blockhash RPC failure to solana_rpc_blockhash_failed', async () => {
    getBalance.mockResolvedValue(50_000_000);
    getLatestBlockhash.mockRejectedValue(new Error('no blockhash'));
    const mint = Keypair.generate().publicKey.toBase58();
    const res = await post({
      name: 'X',
      symbol: 'X',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint,
    });
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: string; stage: string };
    expect(json.error).toBe('solana_rpc_blockhash_failed');
    expect(json.stage).toBe('get_blockhash');
  });

  it('returns transactionBase64 for a funded prepare without broadcasting', async () => {
    getBalance.mockResolvedValue(50_000_000);
    getLatestBlockhash.mockResolvedValue({
      blockhash: Keypair.generate().publicKey.toBase58(),
      lastValidBlockHeight: 123,
    });
    const mint = Keypair.generate().publicKey.toBase58();
    const res = await post({
      name: 'Prepare Ok',
      symbol: 'POK',
      uri: URI,
      creator: CREATOR,
      user: CREATOR,
      mint,
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: true;
      transactionBase64: string;
      recentBlockhash: string;
      prepared: { mint: string };
    };
    expect(json.ok).toBe(true);
    expect(json.transactionBase64.length).toBeGreaterThan(64);
    expect(json.recentBlockhash).toBeTruthy();
    expect(json.prepared.mint).toBe(mint);

    // Client can deserialize without broadcasting.
    const { Transaction } = await import('@solana/web3.js');
    const bytes = Buffer.from(json.transactionBase64, 'base64');
    const tx = Transaction.from(bytes);
    expect(tx.instructions.length).toBe(1);
  });
});
