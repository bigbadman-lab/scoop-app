'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppKitProvider } from '@reown/appkit/react';
import { useAppKitConnection } from '@reown/appkit-adapter-solana/react';
import {
  runSolanaCreatorFeeClaim,
  type SolanaCreatorFeeClaimPhase,
} from '@/lib/account/run-solana-creator-fee-claim';
import {
  PREPARED_TRANSACTION_INVALID,
  SOLANA_RPC_UNAVAILABLE,
  SOLANA_WALLET_SIGNER_UNAVAILABLE,
  type PumpSignProvider,
} from '@/lib/launch/pump-wallet-broadcast';

type FeeSnapshot = {
  creator: string;
  claimableLamports: string;
  claimableSol: string;
  claimableUsd: string | null;
  supported: boolean;
  feeMode: 'standard' | 'sharing' | 'unsupported';
  message: string | null;
};

function phaseLabel(phase: SolanaCreatorFeeClaimPhase): string | null {
  switch (phase) {
    case 'preparing':
      return 'Preparing…';
    case 'awaiting_wallet':
      return 'Confirm in wallet';
    case 'submitted':
      return 'Claim submitted';
    case 'confirming':
      return 'Confirming…';
    case 'claimed':
      return 'Claimed';
    default:
      return null;
  }
}

function userFacingClaimError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === SOLANA_WALLET_SIGNER_UNAVAILABLE) {
    return 'Connect a Solana wallet that can sign transactions.';
  }
  if (message === SOLANA_RPC_UNAVAILABLE) {
    return 'Solana connection unavailable. Try again.';
  }
  if (message === PREPARED_TRANSACTION_INVALID) {
    return 'Could not build the claim transaction.';
  }
  if (/user rejected|denied|cancelled|canceled/i.test(message)) {
    return 'Wallet rejected the claim.';
  }
  if (message.length > 0 && message.length < 120 && !/0x|stack|rpc/i.test(message)) {
    return message;
  }
  return 'Could not claim creator fees.';
}

export function SolanaCreatorFeesLane({
  sessionOnly,
  onClaimed,
}: {
  sessionOnly: boolean;
  onClaimed?: () => void;
}) {
  const { walletProvider } = useAppKitProvider('solana');
  const { connection } = useAppKitConnection();
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<SolanaCreatorFeeClaimPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<string | null>(null);
  const refreshGen = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/solana/creator-fees', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as FeeSnapshot & {
        ok?: boolean;
        error?: string;
      };
      if (gen !== refreshGen.current) return;
      if (!res.ok || data.ok === false) {
        setSnapshot(null);
        setError(data.error ?? 'Could not load creator fees');
        return;
      }
      setSnapshot({
        creator: data.creator,
        claimableLamports: data.claimableLamports,
        claimableSol: data.claimableSol,
        claimableUsd: data.claimableUsd,
        supported: data.supported,
        feeMode: data.feeMode,
        message: data.message,
      });
    } catch {
      if (gen !== refreshGen.current) return;
      setError('Could not load creator fees');
      setSnapshot(null);
    } finally {
      if (gen === refreshGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const claimable =
    snapshot != null &&
    snapshot.supported &&
    BigInt(snapshot.claimableLamports || '0') > BigInt(0);
  const busy =
    phase === 'preparing' ||
    phase === 'awaiting_wallet' ||
    phase === 'submitted' ||
    phase === 'confirming';

  async function onClaim() {
    if (!claimable || busy || sessionOnly) return;
    setError(null);
    setStatusMessage(null);
    setPhase('idle');
    try {
      const result = await runSolanaCreatorFeeClaim({
        walletProvider: (walletProvider ?? {}) as PumpSignProvider,
        connection: connection ?? null,
        existingSignature: lastSignature,
        onPhase: setPhase,
      });
      setLastSignature(result.signature);
      if (result.status === 'confirmed') {
        setPhase('claimed');
        setLastSignature(null);
        setStatusMessage('Claimed — your unclaimed balance will update shortly.');
        await refresh();
        onClaimed?.();
        return;
      }
      if (result.status === 'failed') {
        setLastSignature(null);
        setPhase('error');
        setError('Claim transaction failed on-chain.');
        return;
      }
      // Ambiguous — keep signature; do not blind retry broadcast.
      setPhase('claimed');
      setStatusMessage(
        'Claim sent. Your wallet should show it shortly — give it a moment before claiming again.',
      );
      void refresh();
      onClaimed?.();
    } catch (err) {
      setPhase('error');
      setError(userFacingClaimError(err));
    }
  }

  return (
    <section
      className="mt-10 space-y-4 border-t border-[var(--divider)] pt-8"
      data-testid="solana-creator-fees"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Creator fees</h2>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Fees earned from your Pump launches.
        </p>
      </div>

      {loading && !snapshot ? (
        <p className="font-mono text-[12px] text-[var(--muted)]" data-testid="solana-creator-fees-loading">
          Loading…
        </p>
      ) : null}

      {snapshot ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Unclaimed
          </p>
          <p
            className="mt-2 text-2xl font-semibold tracking-tight"
            data-testid="solana-creator-fees-sol"
          >
            {snapshot.claimableSol} SOL
          </p>
          <p
            className="mt-1 font-mono text-[12px] text-[var(--muted)]"
            data-testid="solana-creator-fees-usd"
          >
            {snapshot.claimableUsd ? `≈ ${snapshot.claimableUsd}` : 'USD —'}
          </p>
          {snapshot.message ? (
            <p className="mt-3 text-sm text-[var(--muted)]">{snapshot.message}</p>
          ) : null}

          {!snapshot.supported ? (
            <p
              className="mt-4 font-mono text-[12px] text-[var(--muted)]"
              data-testid="solana-creator-fees-sharing"
            >
              Creator fees use Pump fee sharing. Claim via Pump.fun for now.
            </p>
          ) : (
            <button
              type="button"
              disabled={!claimable || busy || sessionOnly}
              onClick={() => void onClaim()}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--scoop-green)] px-5 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--scoop-green-contrast)] disabled:opacity-40"
              data-testid="solana-creator-fees-claim"
            >
              {phaseLabel(phase) ?? 'Claim creator fees'}
            </button>
          )}

          {sessionOnly && snapshot.supported ? (
            <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
              Connect your Solana wallet to claim.
            </p>
          ) : null}

          {lastSignature ? (
            <p className="mt-3 break-all font-mono text-[10px] text-[var(--muted-2)]">
              sig {lastSignature}
            </p>
          ) : null}
        </div>
      ) : null}

      {statusMessage ? (
        <p
          className="font-mono text-[11px] text-[var(--muted)]"
          role="status"
          data-testid="solana-creator-fees-status"
        >
          {statusMessage}
        </p>
      ) : null}

      {error ? (
        <p className="font-mono text-[11px] text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
