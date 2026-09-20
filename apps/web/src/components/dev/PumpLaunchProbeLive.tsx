'use client';

import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useCallback, useMemo, useState } from 'react';
import {
  clearPumpMintAttempt,
  createPumpMintAttempt,
  projectPumpMetadataUri,
  replacePumpMintAttempt,
  type PumpSimulateReport,
} from '@/lib/launch/adapters/pump/adapter';
import { PUMP_INITIAL_BUY_FEASIBILITY } from '@/lib/launch/adapters/pump/initial-buy';
import { SOLANA_CLUSTER } from '@/lib/solana/networks';

const TEST_NAME = 'Scoop Gate C';
const TEST_SYMBOL = 'SGATEC';
const TEST_IMAGE_URI =
  'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';

type SimResponse = PumpSimulateReport & {
  preview?: {
    mint?: string;
    mintSource?: string;
    programId?: string;
  };
};

/**
 * Gate C: Build / Simulate only — no Launch / Send / broadcast.
 * Mint secret stays in browser memory (mint-lifecycle); only the pubkey is POSTed.
 */
export function PumpLaunchProbeLive() {
  const { open } = useAppKit();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const wallet = solanaAccount.address ?? null;
  const connected = Boolean(solanaAccount.isConnected && wallet);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [mintPk, setMintPk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sim, setSim] = useState<SimResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const meta = useMemo(
    () =>
      projectPumpMetadataUri({
        name: TEST_NAME,
        symbol: TEST_SYMBOL,
        description: 'Gate C Pump create preview',
        scoopImageIpfsUri: TEST_IMAGE_URI,
      }),
    [],
  );

  const ensureMint = useCallback(() => {
    if (attemptId && mintPk) return { attemptId, mintPublicKey: mintPk };
    const handle = createPumpMintAttempt();
    setAttemptId(handle.attemptId);
    setMintPk(handle.mintPublicKey);
    return handle;
  }, [attemptId, mintPk]);

  const onNewMint = () => {
    const handle = replacePumpMintAttempt(attemptId);
    setAttemptId(handle.attemptId);
    setMintPk(handle.mintPublicKey);
    setSim(null);
    setError(null);
  };

  const onBuildSimulate = async () => {
    setBusy(true);
    setError(null);
    setSim(null);
    try {
      if (!wallet) throw new Error('Connect a Solana wallet first.');
      const handle = ensureMint();

      const res = await fetch('/api/dev/pump-build-simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: TEST_NAME,
          symbol: TEST_SYMBOL,
          uri: meta.uri,
          creator: wallet,
          user: wallet,
          mint: handle.mintPublicKey,
        }),
      });
      const report = (await res.json()) as SimResponse;
      setSim(report);
      if (!report.ok) setError(report.error ?? 'Simulation BLOCKED');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build/simulate failed');
    } finally {
      setBusy(false);
    }
  };

  const onClearMint = () => {
    if (attemptId) clearPumpMintAttempt(attemptId);
    setAttemptId(null);
    setMintPk(null);
    setSim(null);
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
        Gate C — Pump create preview
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Pump launch preview</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Build / Simulate only. No broadcast. Mint secret never leaves the browser.
        Initial buy:{' '}
        {PUMP_INITIAL_BUY_FEASIBILITY.recommendation === 'CREATE_ONLY'
          ? 'none (recommended)'
          : 'optional'}
        .
      </p>

      <pre className="mt-8 overflow-x-auto rounded border border-[var(--divider)] p-4 font-mono text-[13px] leading-relaxed">
        {`Pump launch preview

Network: Solana ${SOLANA_CLUSTER}
Creator: ${wallet ?? '—'}
Mint: ${mintPk ?? '—'}
Pair: SOL
Name: ${TEST_NAME}
Ticker: ${TEST_SYMBOL}
Metadata: ${meta.uri}
Initial buy: none
Estimated transaction fee: —
Simulation: ${sim?.status ?? '—'}
${sim?.unitsConsumed != null ? `CU: ${sim.unitsConsumed}` : ''}
${sim?.error ? `Sim error: ${sim.error}` : ''}
${sim ? `Checks: pump=${sim.checks.pumpProgram} token2022=${sim.checks.token2022} mintSigner=${sim.checks.mintIsSigner} userSigner=${sim.checks.userIsSigner} accounts=${sim.checks.accountCount}` : ''}`}
      </pre>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void open({ namespace: 'solana' })}
          className="rounded border border-[var(--fg)] bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)]"
        >
          Connect Solana wallet
        </button>
        <button
          type="button"
          onClick={onNewMint}
          className="rounded border border-[var(--divider)] px-4 py-2 text-sm"
        >
          New mint keypair
        </button>
        <button
          type="button"
          onClick={() => void onBuildSimulate()}
          disabled={!connected || busy}
          className="rounded border border-[var(--divider)] px-4 py-2 text-sm disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Build / Simulate'}
        </button>
        <button
          type="button"
          onClick={onClearMint}
          className="rounded border border-[var(--divider)] px-4 py-2 text-sm"
        >
          Clear mint secret
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-700">
          <span className="font-medium">Error: </span>
          {error}
        </p>
      )}
    </main>
  );
}
