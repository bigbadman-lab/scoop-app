'use client';

import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { SOLANA_CLUSTER } from '@/lib/solana/networks';

type ProbeRpcResponse = {
  cluster?: string;
  rpc?: string;
  slot?: number | null;
  address?: string;
  balanceSol?: number | null;
  error?: string | null;
};

/**
 * Gate B live panel: Solana connect + balance via server RPC + message sign.
 * Does not touch SIWE / scoop_session. No SOL moves.
 */
export function SolanaWalletProbeLive() {
  const { open } = useAppKit();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const evm = useAccount();

  const [rpcStatus, setRpcStatus] = useState<ProbeRpcResponse | null>(null);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [signResult, setSignResult] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  const solanaAddress = solanaAccount.address ?? null;
  const solanaConnected = Boolean(solanaAccount.isConnected && solanaAddress);

  const refreshRpc = useCallback(async (address?: string | null) => {
    setRpcLoading(true);
    try {
      const qs = address ? `?address=${encodeURIComponent(address)}` : '';
      const res = await fetch(`/api/dev/solana-probe${qs}`, { cache: 'no-store' });
      const body = (await res.json()) as ProbeRpcResponse;
      setRpcStatus(body);
    } catch (err) {
      setRpcStatus({
        rpc: 'FAIL',
        error: err instanceof Error ? err.message : 'Probe fetch failed',
      });
    } finally {
      setRpcLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshRpc(solanaAddress);
  }, [refreshRpc, solanaAddress]);

  const onConnectSolana = () => {
    void open({ namespace: 'solana' });
  };

  const onSignMessage = async () => {
    setSignResult(null);
    setSignError(null);
    if (!walletProvider?.signMessage) {
      const hasTxSign = typeof walletProvider?.signAndSendTransaction === 'function';
      setSignError(
        hasTxSign
          ? 'signMessage missing; signAndSendTransaction is exposed (Pump-ready path).'
          : 'Solana wallet provider has no signing methods.',
      );
      return;
    }
    try {
      const message = new TextEncoder().encode(
        `SCOOP Gate B Solana probe — ${new Date().toISOString()}`,
      );
      const signature = await walletProvider.signMessage(message);
      // Do not print full signature bytes — length + method only.
      setSignResult(
        `signMessage OK (${signature.byteLength} bytes). Methods: signMessage, signTransaction, signAndSendTransaction.`,
      );
    } catch (err) {
      setSignError(err instanceof Error ? err.message : 'signMessage failed');
    }
  };

  const balanceLine =
    typeof rpcStatus?.balanceSol === 'number'
      ? `${rpcStatus.balanceSol.toFixed(4)} SOL`
      : rpcLoading
        ? '…'
        : '—';

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--scoop-green)]">
        Gate B — Solana wallet + RPC
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Solana wallet probe</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Connect a Solana wallet via AppKit. Balance reads use server{' '}
        <code className="font-mono text-[12px]">SOLANA_RPC_URL</code>. SIWE / EVM
        session is untouched.
      </p>

      <pre className="mt-8 overflow-x-auto rounded border border-[var(--divider)] bg-[var(--bg)] p-4 font-mono text-[13px] leading-relaxed text-[var(--fg)]">
        {solanaConnected ? 'Solana connected' : 'Solana disconnected'}
        {'\n'}
        Wallet: {solanaAddress ?? '—'}
        {'\n'}
        Network: {SOLANA_CLUSTER}
        {'\n'}
        Balance: {balanceLine}
        {'\n'}
        RPC: {rpcStatus?.rpc ?? (rpcLoading ? '…' : '—')}
        {typeof rpcStatus?.slot === 'number' ? `\nSlot: ${rpcStatus.slot}` : ''}
        {rpcStatus?.error ? `\nRPC error: ${rpcStatus.error}` : ''}
      </pre>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConnectSolana}
          className="rounded border border-[var(--fg)] bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)]"
        >
          Connect Solana wallet
        </button>
        <button
          type="button"
          onClick={() => void refreshRpc(solanaAddress)}
          className="rounded border border-[var(--divider)] px-4 py-2 text-sm"
        >
          Refresh RPC / balance
        </button>
        <button
          type="button"
          onClick={() => void onSignMessage()}
          disabled={!solanaConnected}
          className="rounded border border-[var(--divider)] px-4 py-2 text-sm disabled:opacity-40"
        >
          Sign probe message
        </button>
      </div>

      {(signResult || signError) && (
        <p className="mt-4 text-sm">
          <span className="font-medium">Signing: </span>
          {signResult ?? signError}
        </p>
      )}

      <section className="mt-10 border-t border-[var(--divider)] pt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Robinhood / EVM (regression glance)
        </h2>
        <pre className="mt-3 overflow-x-auto rounded border border-[var(--divider)] p-4 font-mono text-[13px]">
          EVM connected: {evm.isConnected ? 'yes' : 'no'}
          {'\n'}
          EVM address: {evm.address ?? '—'}
          {'\n'}
          chainId: {evm.chainId ?? '—'} (expect {ROBINHOOD_CHAIN_ID})
        </pre>
        <button
          type="button"
          onClick={() => void open({ namespace: 'eip155' })}
          className="mt-3 rounded border border-[var(--divider)] px-4 py-2 text-sm"
        >
          Open EVM connect
        </button>
      </section>
    </main>
  );
}
