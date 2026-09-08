'use client';

import { useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import { useCallback, useState } from 'react';
import {
  createPublicClient,
  formatEther,
  http,
  type Hex,
} from 'viem';
import {
  useAccount,
  useSignMessage,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { shortenWalletAddress } from '@/lib/auth/reown-public';
import {
  fetchScoopAuthStatus,
  requestSiweSession,
} from '@/lib/auth/siwe-session-client';
import { resolveRobinhoodPublicRpc } from '@/lib/auth/chain';

type StepResult = {
  ok: boolean;
  detail: string;
};

function ResultLine({ label, result }: { label: string; result: StepResult | null }) {
  if (!result) {
    return (
      <p className="font-mono text-[11px] text-[var(--muted-2)]">
        {label}: not run
      </p>
    );
  }
  return (
    <p
      className={`font-mono text-[11px] ${result.ok ? 'text-[var(--fg)]' : 'text-[#b42318]'}`}
    >
      {label}: {result.ok ? 'OK' : 'FAIL'} — {result.detail}
    </p>
  );
}

/**
 * Heavy C.3-proof panel — AppKit/wagmi only. Temporary; not product UX.
 */
export function ReownEmailProofLive() {
  const { open } = useAppKit();
  const appKitAccount = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { address, isConnected, chainId, connector } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const [siweResult, setSiweResult] = useState<StepResult | null>(null);
  const [sessionResult, setSessionResult] = useState<StepResult | null>(null);
  const [chainResult, setChainResult] = useState<StepResult | null>(null);
  const [rpcResult, setRpcResult] = useState<StepResult | null>(null);
  const [simResult, setSimResult] = useState<StepResult | null>(null);
  const [signTxResult, setSignTxResult] = useState<StepResult | null>(null);
  const [splitPrepareResult, setSplitPrepareResult] = useState<StepResult | null>(
    null,
  );
  const [splitPrepareFields, setSplitPrepareFields] = useState<string[]>([]);
  const [pathDiag, setPathDiag] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const embedded = appKitAccount.embeddedWalletInfo;
  const short = address ? shortenWalletAddress(address) : '—';

  const assertEmbeddedEmailEoa = useCallback((): string | null => {
    if (!isConnected || !address) return 'wallet not connected';
    if (!embedded) return 'Embedded email EOA required for this proof.';
    if (embedded.authProvider !== 'email') {
      return 'Embedded email EOA required for this proof.';
    }
    if (embedded.accountType !== 'eoa') {
      return 'Embedded email EOA required for this proof.';
    }
    if (embedded.isSmartAccountDeployed) {
      return 'Embedded email EOA required for this proof.';
    }
    if (chainId !== ROBINHOOD_CHAIN_ID) {
      return `active chainId must be ${ROBINHOOD_CHAIN_ID}`;
    }
    return null;
  }, [isConnected, address, embedded, chainId]);

  const runSiwe = useCallback(async () => {
    if (!address || !connector) return;
    setBusy('siwe');
    setError(null);
    try {
      const result = await requestSiweSession(
        address,
        async ({ message }) => signMessageAsync({ message, connector }),
        ROBINHOOD_CHAIN_ID,
        { connectedAddress: address },
      );
      setSiweResult({
        ok: result.ok,
        detail: result.ok
          ? `session matches ${shortenWalletAddress(result.address)} user ${result.userId.slice(0, 8)}`
          : `${result.code}: ${result.message}`,
      });
      const status = await fetchScoopAuthStatus();
      setSessionResult(
        status.authenticated
          ? {
              ok: true,
              detail: `authenticated ${shortenWalletAddress(status.address)} user ${status.userId.slice(0, 8)} chain ${status.chainId}`,
            }
          : { ok: false, detail: 'session unauthenticated' },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SIWE error';
      setSiweResult({ ok: false, detail: message.slice(0, 160) });
      setError(message.slice(0, 200));
    } finally {
      setBusy(null);
    }
  }, [address, connector, signMessageAsync]);

  const runChainSwitch = useCallback(async () => {
    setBusy('chain');
    setError(null);
    try {
      if (chainId !== ROBINHOOD_CHAIN_ID) {
        await switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID });
      }
      setChainResult({
        ok: true,
        detail: `active chainId=${ROBINHOOD_CHAIN_ID}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'switch failed';
      setChainResult({ ok: false, detail: message.slice(0, 160) });
    } finally {
      setBusy(null);
    }
  }, [chainId, switchChainAsync]);

  const runRpcRead = useCallback(async () => {
    setBusy('rpc');
    setError(null);
    try {
      const rpc = resolveRobinhoodPublicRpc();
      const client = createPublicClient({
        transport: http(rpc),
      });
      const [id, blockNumber] = await Promise.all([
        client.getChainId(),
        client.getBlockNumber(),
      ]);
      const balance =
        address != null
          ? await client.getBalance({ address: address as Hex })
          : null;
      const ok = id === ROBINHOOD_CHAIN_ID;
      setRpcResult({
        ok,
        detail: ok
          ? `chainId=${id} block=${blockNumber.toString()}${
              balance != null ? ` bal=${formatEther(balance)} ETH` : ''
            }`
          : `unexpected chainId=${id}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'RPC failed';
      setRpcResult({ ok: false, detail: message.slice(0, 160) });
    } finally {
      setBusy(null);
    }
  }, [address]);

  /** C.3-proof-diagnosis: compare public Robinhood RPC vs Magic wallet-provider RPC. */
  const runPathDiagnosis = useCallback(async () => {
    if (!address) return;
    setBusy('diag');
    setError(null);
    const lines: string[] = [];
    const push = (line: string) => {
      lines.push(line);
      setPathDiag([...lines]);
    };

    const rpc = resolveRobinhoodPublicRpc();
    const publicClient = createPublicClient({ transport: http(rpc) });
    push(
      'walletClient transport: connector EIP-1193 (wagmi getConnectorClient → custom(provider))',
    );
    push(`connector: ${connector?.id ?? '—'} / ${connector?.name ?? '—'}`);
    push('publicClient transport: http(SCOOP Robinhood RPC) — URL not logged');

    const safeErr = (err: unknown) =>
      (err instanceof Error ? err.message : String(err))
        .replace(/https?:\/\/[^\s'"]+/gi, '[rpc]')
        .slice(0, 140);

    try {
      const n = await publicClient.getTransactionCount({
        address: address as Hex,
        blockTag: 'pending',
      });
      push(`A public getTransactionCount: OK nonce=${n}`);
    } catch (err) {
      push(`A public getTransactionCount: FAIL ${safeErr(err)}`);
    }
    try {
      const fees = await publicClient.estimateFeesPerGas();
      push(
        `B public estimateFeesPerGas: OK maxFee=${fees.maxFeePerGas?.toString() ?? '—'}`,
      );
    } catch (err) {
      push(`B public estimateFeesPerGas: FAIL ${safeErr(err)}`);
    }
    try {
      const gas = await publicClient.estimateGas({
        account: address as Hex,
        to: address as Hex,
        value: BigInt(0),
      });
      push(`C public estimateGas: OK gas=${gas.toString()}`);
    } catch (err) {
      push(`C public estimateGas: FAIL ${safeErr(err)}`);
    }

    if (!walletClient) {
      push('walletClient unavailable — skip Magic-provider substeps');
      setBusy(null);
      return;
    }
    // Diagnosis probes Magic RPC methods outside wallet-client EIP-1193 typings.
    const magicRequest = (args: { method: string; params?: unknown[] }) =>
      (walletClient.request as (a: { method: string; params?: unknown[] }) => Promise<unknown>)(
        args,
      );
    try {
      const n = (await magicRequest({
        method: 'eth_getTransactionCount',
        params: [address, 'pending'],
      })) as string;
      push(`A wallet eth_getTransactionCount: OK nonce=${n}`);
    } catch (err) {
      push(`A wallet eth_getTransactionCount: FAIL ${safeErr(err)}`);
    }
    try {
      const tip = (await magicRequest({
        method: 'eth_maxPriorityFeePerGas',
        params: [],
      })) as string;
      push(`B wallet eth_maxPriorityFeePerGas: OK ${tip}`);
    } catch (err) {
      push(`B wallet eth_maxPriorityFeePerGas: FAIL ${safeErr(err)}`);
    }
    try {
      const gas = (await magicRequest({
        method: 'eth_estimateGas',
        params: [{ from: address, to: address, value: '0x0' }],
      })) as string;
      push(`C wallet eth_estimateGas: OK gas=${gas}`);
    } catch (err) {
      push(`C wallet eth_estimateGas: FAIL ${safeErr(err)}`);
    }

    push(
      'D wallet prepareTransactionRequest: previously FAIL Magic -32603 (uses A/B/C via same provider)',
    );
    push(
      'E eth_signTransaction: not in W3mFrame SAFE/NOT_SAFE lists — likely NOT EXPOSED; eth_sendTransaction is the frame send path',
    );
    push('Broadcast: NOT ATTEMPTED');
    setBusy(null);
  }, [address, walletClient, connector]);

  const runPrepareTx = useCallback(async () => {
    if (!address || !walletClient) {
      setSimResult({ ok: false, detail: 'wallet client unavailable' });
      return;
    }
    setBusy('sim');
    setError(null);
    try {
      if (chainId !== ROBINHOOD_CHAIN_ID) {
        await switchChainAsync({ chainId: ROBINHOOD_CHAIN_ID });
      }
      // Routes nonce/gas/fee reads through Magic EIP-1193 — fails on 4663.
      const prepared = await walletClient.prepareTransactionRequest({
        account: address as Hex,
        to: address as Hex,
        value: BigInt(0),
        chain: undefined,
      });
      setSimResult({
        ok: true,
        detail: `prepared to=${shortenWalletAddress(String(prepared.to))} value=0 (not sent)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'prepare failed';
      setSimResult({ ok: false, detail: message.slice(0, 200) });
    } finally {
      setBusy(null);
    }
  }, [address, walletClient, chainId, switchChainAsync]);

  /**
   * C.3-proof2: prepare 0-ETH self-tx via SCOOP Robinhood publicClient only.
   * Does not call walletClient.prepareTransactionRequest / send / sign.
   */
  const runSplitClientPrepare = useCallback(async () => {
    setBusy('split');
    setError(null);
    setSplitPrepareFields([]);
    setSplitPrepareResult(null);

    const guard = assertEmbeddedEmailEoa();
    if (guard || !address) {
      setSplitPrepareResult({
        ok: false,
        detail: guard ?? 'wallet not connected',
      });
      setBusy(null);
      return;
    }

    try {
      const status = await fetchScoopAuthStatus();
      if (
        !status.authenticated ||
        !status.address ||
        status.address.toLowerCase() !== address.toLowerCase() ||
        status.chainId !== ROBINHOOD_CHAIN_ID
      ) {
        setSplitPrepareResult({
          ok: false,
          detail:
            'scoop_session required — run SIWE first (session must match embedded address on 4663)',
        });
        setBusy(null);
        return;
      }

      // Public HTTP only — wallet/Magic provider is not used for any RPC below.
      const rpc = resolveRobinhoodPublicRpc();
      const publicClient = createPublicClient({ transport: http(rpc) });
      const from = address as Hex;

      const publicChainId = await publicClient.getChainId();
      if (publicChainId !== ROBINHOOD_CHAIN_ID) {
        setSplitPrepareResult({
          ok: false,
          detail: `public chainId=${publicChainId} expected ${ROBINHOOD_CHAIN_ID}`,
        });
        setBusy(null);
        return;
      }

      const nonce = await publicClient.getTransactionCount({
        address: from,
        blockTag: 'pending',
      });
      const fees = await publicClient.estimateFeesPerGas();
      const gas = await publicClient.estimateGas({
        account: from,
        to: from,
        value: BigInt(0),
      });

      // Read-only sanity call (no state change).
      await publicClient.call({
        account: from,
        to: from,
        value: BigInt(0),
      });

      const maxFeePerGas = fees.maxFeePerGas;
      const maxPriorityFeePerGas = fees.maxPriorityFeePerGas;

      if (gas <= BigInt(0)) {
        setSplitPrepareResult({ ok: false, detail: 'gas must be > 0' });
        setBusy(null);
        return;
      }
      if (maxFeePerGas == null || maxPriorityFeePerGas == null) {
        setSplitPrepareResult({
          ok: false,
          detail: 'EIP-1559 fee fields unresolved from public RPC',
        });
        setBusy(null);
        return;
      }

      // Structural eth_sendTransaction compatibility (inspection only — never invoked).
      const sendCompat =
        'structurally compatible with eth_sendTransaction (from/to/value/gas/nonce/chainId/maxFeePerGas/maxPriorityFeePerGas/type) — SEND UNPROVEN';

      const fields = [
        `from: ${shortenWalletAddress(from)}`,
        `to: ${shortenWalletAddress(from)}`,
        `chainId: ${ROBINHOOD_CHAIN_ID}`,
        `nonce: ${nonce}`,
        `gas: ${gas.toString()}`,
        'type: eip1559',
        `maxFeePerGas: ${maxFeePerGas.toString()}`,
        `maxPriorityFeePerGas: ${maxPriorityFeePerGas.toString()}`,
        'value: 0',
        'Magic/Auth preparation RPC: not used',
        sendCompat,
      ];
      setSplitPrepareFields(fields);
      setSplitPrepareResult({
        ok: true,
        detail: `publicClient-only prepare · nonce=${nonce} gas=${gas.toString()} type=eip1559`,
      });
    } catch (err) {
      const message = (err instanceof Error ? err.message : 'split prepare failed')
        .replace(/https?:\/\/[^\s'"]+/gi, '[rpc]')
        .slice(0, 200);
      setSplitPrepareResult({ ok: false, detail: message });
    } finally {
      setBusy(null);
    }
  }, [address, assertEmbeddedEmailEoa]);

  const runSignTxWithoutBroadcast = useCallback(async () => {
    if (!address || !walletClient) {
      setSignTxResult({ ok: false, detail: 'wallet client unavailable' });
      return;
    }
    setBusy('signtx');
    setError(null);
    try {
      if (typeof walletClient.signTransaction !== 'function') {
        setSignTxResult({
          ok: false,
          detail: 'signTransaction unsupported — broadcast capability remains UNPROVEN',
        });
        return;
      }
      const prepared = await walletClient.prepareTransactionRequest({
        account: address as Hex,
        to: address as Hex,
        value: BigInt(0),
      });
      // May still be rejected by embedded providers that only expose sendTransaction.
      const signed = await walletClient.signTransaction(prepared);
      setSignTxResult({
        ok: true,
        detail: `signed ${signed.slice(0, 12)}… (not broadcast)`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'signTransaction failed';
      setSignTxResult({
        ok: false,
        detail: `${message.slice(0, 160)} — broadcast remains UNPROVEN`,
      });
    } finally {
      setBusy(null);
    }
  }, [address, walletClient]);

  const runSignOut = useCallback(async () => {
    setBusy('signout');
    setError(null);
    try {
      await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' });
      await disconnect();
      setSiweResult(null);
      setSessionResult({ ok: true, detail: 'signed out locally + cleared scoop_session' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'sign out failed';
      setError(message.slice(0, 200));
    } finally {
      setBusy(null);
    }
  }, [disconnect]);

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-16">
      <header className="space-y-3">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-orange)]">
          C.3-proof · temporary
        </p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Reown email / embedded wallet on Robinhood 4663
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Isolated capability proof. Does not enable Join SCOOP in product UX.
          No ScoopFactory broadcast. Prefer email OTP → embedded EOA → SIWE →
          safe chain checks.
        </p>
      </header>

      <section className="space-y-2 border border-[var(--divider)] p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Connection
        </h2>
        <p className="font-mono text-[12px]">connected: {String(isConnected)}</p>
        <p className="font-mono text-[12px]">address: {short}</p>
        <p className="font-mono text-[12px]">wagmi chainId: {chainId ?? '—'}</p>
        <p className="font-mono text-[12px]">connector: {connector?.name ?? '—'}</p>
        <p className="font-mono text-[12px]">
          embedded: {embedded ? 'yes' : 'no / external'}
        </p>
        <p className="font-mono text-[12px]">
          authProvider: {embedded?.authProvider ?? '—'}
        </p>
        <p className="font-mono text-[12px]">
          accountType: {embedded?.accountType ?? '—'}
        </p>
        <p className="font-mono text-[12px]">
          smartAccountDeployed: {embedded ? String(embedded.isSmartAccountDeployed) : '—'}
        </p>
      </section>

      <section className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => void open({ view: 'Connect' })}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange-contrast)]"
        >
          Open AppKit (email)
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null || signing}
          onClick={() => void runSiwe()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'siwe' || signing ? 'SIWE…' : 'Run SCOOP SIWE'}
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null || switching}
          onClick={() => void runChainSwitch()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'chain' ? '…' : 'Ensure chain 4663'}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void runRpcRead()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'rpc' ? '…' : 'RPC read 4663'}
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null}
          onClick={() => void runPathDiagnosis()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'diag' ? '…' : 'Run path diagnosis (public vs Magic)'}
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null}
          onClick={() => void runSplitClientPrepare()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--scoop-orange)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-orange)] disabled:opacity-40"
        >
          {busy === 'split' ? '…' : 'Prepare via public RPC (no broadcast)'}
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null}
          onClick={() => void runPrepareTx()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'sim' ? '…' : 'Prepare 0-ETH tx (no broadcast)'}
        </button>
        <button
          type="button"
          disabled={!isConnected || busy != null}
          onClick={() => void runSignTxWithoutBroadcast()}
          className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] disabled:opacity-40"
        >
          {busy === 'signtx' ? '…' : 'signTransaction (no broadcast)'}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void runSignOut()}
          className="inline-flex min-h-11 items-center justify-center font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)] hover:text-[var(--fg)] disabled:opacity-40"
        >
          Sign out (AppKit + scoop_session)
        </button>
      </section>

      {error ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-2 border border-[var(--divider)] p-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Results
        </h2>
        <ResultLine label="SIWE" result={siweResult} />
        <ResultLine label="Session" result={sessionResult} />
        <ResultLine label="Chain selection" result={chainResult} />
        <ResultLine label="RPC read" result={rpcResult} />
        <ResultLine label="Split-client prepare" result={splitPrepareResult} />
        <ResultLine label="Tx prepare/simulation" result={simResult} />
        <ResultLine label="Tx sign w/o broadcast" result={signTxResult} />
        <p className="font-mono text-[11px] text-[var(--muted-2)]">
          Broadcast: NOT ATTEMPTED
        </p>
        {splitPrepareFields.length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-[var(--divider)] pt-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Prepared request (publicClient)
            </p>
            {splitPrepareFields.map((line) => (
              <p key={line} className="font-mono text-[10px] text-[var(--fg)]">
                {line}
              </p>
            ))}
          </div>
        ) : null}
        {pathDiag.length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-[var(--divider)] pt-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              Path diagnosis
            </p>
            {pathDiag.map((line) => (
              <p key={line} className="font-mono text-[10px] text-[var(--fg)]">
                {line}
              </p>
            ))}
          </div>
        ) : null}
      </section>

      <p className="text-xs text-[var(--muted-2)]">
        After sign-out, open AppKit again with the same email and confirm the
        same address restores. Do not export or display private keys.
      </p>
    </main>
  );
}
