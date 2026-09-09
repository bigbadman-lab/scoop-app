/**
 * Final launch orchestration (V2.C).
 * Pin → resolve creator → build params → fee → simulate → write → receipt.
 */
import type {
  Account,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
  WriteContractParameters,
} from 'viem';
import { buildLaunchParams } from '@/lib/launch/build-launch-params';
import {
  isCreatorResolved,
  resolveCreatorRecipient,
} from '@/lib/launch/creator-recipient';
import {
  assertCreatorIdMatches,
  assertDeployerMatches,
  decodeTokenLaunchedFromReceipt,
} from '@/lib/launch/decode-launch';
import { ensureArtworkPinned } from '@/lib/launch/ensure-ipfs';
import {
  prepareWalletLaunchRequest,
  readLaunchFeeWei,
  shortenLaunchError,
  simulateLaunch,
  writeLaunchAfterSimulation,
  SCOOP_FACTORY_ADDRESS,
  type PreparedLaunchRequest,
} from '@/lib/launch/execute';
import type { LaunchFormState, TokenImageState } from '@/lib/launch/types';
import {
  type LaunchChecklist,
  type LaunchTxState,
  INITIAL_LAUNCH_TX_STATE,
} from '@/lib/launch/tx-state';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { isArtworkBlockingLaunch } from '@/lib/launch/validation';

export type LaunchOrchestratorCallbacks = {
  onPhase: (patch: Partial<LaunchTxState>) => void;
  onImagePinned: (image: TokenImageState) => void;
};

export type RunWalletLaunchInput = {
  state: LaunchFormState;
  /** Live wagmi address at press time — re-read again before write. */
  liveAddress: `0x${string}`;
  liveChainId: number | undefined;
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>;
  /** Re-read live account/chain immediately before write. */
  getLiveAccount: () => {
    address: `0x${string}` | undefined;
    chainId: number | undefined;
  };
  signal?: AbortSignal;
  callbacks: LaunchOrchestratorCallbacks;
};

export type RunWalletLaunchResult =
  | { ok: true; txHash: `0x${string}`; state: LaunchTxState }
  | { ok: false; state: LaunchTxState };

function fail(
  callbacks: LaunchOrchestratorCallbacks,
  error: string,
  base: Partial<LaunchTxState> = {},
): LaunchTxState {
  const state: LaunchTxState = {
    ...INITIAL_LAUNCH_TX_STATE,
    ...base,
    phase: 'failed',
    error: shortenLaunchError(error),
  };
  callbacks.onPhase(state);
  return state;
}

export async function runWalletLaunch(
  input: RunWalletLaunchInput,
): Promise<RunWalletLaunchResult> {
  const { callbacks } = input;
  let txState: LaunchTxState = { ...INITIAL_LAUNCH_TX_STATE };

  const patch = (partial: Partial<LaunchTxState>) => {
    txState = { ...txState, ...partial };
    callbacks.onPhase(txState);
  };

  try {
    if (!input.liveAddress) {
      return { ok: false, state: fail(callbacks, 'Connect a wallet to launch.') };
    }
    if (input.liveChainId !== ROBINHOOD_CHAIN_ID) {
      return {
        ok: false,
        state: fail(callbacks, 'Switch to Robinhood Chain (4663) to launch.'),
      };
    }
    if (isArtworkBlockingLaunch(input.state)) {
      return {
        ok: false,
        state: fail(callbacks, 'Token image must be ready before launch.'),
      };
    }

    // 1) Pin artwork (reuse if present)
    patch({ phase: 'preparing_artwork', error: null });
    const pinned = await ensureArtworkPinned({
      image: input.state.image,
      signal: input.signal,
    });
    const imageAfterPin: TokenImageState = {
      ...input.state.image,
      ipfsUri: pinned.ipfsUri,
      persistence: 'ipfs_ready',
    };
    if (!pinned.reused) {
      callbacks.onImagePinned(imageAfterPin);
    } else if (input.state.image.ipfsUri !== pinned.ipfsUri) {
      callbacks.onImagePinned(imageAfterPin);
    }

    const stateForParams: LaunchFormState = {
      ...input.state,
      image: imageAfterPin,
    };

    // 2) Resolve creator from LIVE wallet + build fresh params
    const recipient = resolveCreatorRecipient(stateForParams, input.liveAddress);
    if (!isCreatorResolved(recipient) || recipient.type !== 'wallet') {
      return {
        ok: false,
        state: fail(
          callbacks,
          recipient.type === 'unresolved'
            ? recipient.reason
            : 'Only wallet creator rewards are supported for launch.',
        ),
      };
    }

    const built = buildLaunchParams({
      state: stateForParams,
      liveConnectedAddress: input.liveAddress,
      imageUri: pinned.ipfsUri,
      chainId: ROBINHOOD_CHAIN_ID,
    });
    if (!built.ok) {
      const first = Object.values(built.errors)[0] ?? 'Launch validation failed.';
      return { ok: false, state: fail(callbacks, first) };
    }

    // 3) Authoritative fee
    const { feeWei } = await readLaunchFeeWei(input.publicClient);
    const request: PreparedLaunchRequest = prepareWalletLaunchRequest({
      params: built.params,
      account: input.liveAddress,
      launchFeeWei: feeWei,
    });

    const checklist: LaunchChecklist = {
      chainId: ROBINHOOD_CHAIN_ID,
      factory: SCOOP_FACTORY_ADDRESS,
      functionName: 'launch',
      signer: input.liveAddress.toLowerCase() as `0x${string}`,
      creatorType: 'wallet',
      creatorSource: recipient.source,
      creatorWallet: recipient.address,
      creatorId: built.params.creatorId,
      quoteAsset: built.params.quoteAsset,
      launchFeeWei: feeWei.toString(),
      msgValueWei: feeWei.toString(),
      salt: built.params.salt,
      imageUri: built.params.metadata.imageUri,
      tokenName: built.params.name,
      tokenSymbol: built.params.symbol,
    };

    patch({
      checklist,
      expectedCreatorId: built.params.creatorId,
      expectedDeployer: input.liveAddress.toLowerCase() as `0x${string}`,
      provenance: built.provenance,
    });

    // Log checklist for human pre-sign inspection (no secrets).
    console.info(
      JSON.stringify({
        event: 'scoop_launch_checklist',
        ...checklist,
      }),
    );

    // 4) Simulate
    patch({ phase: 'simulating' });
    let simulatedRequest: WriteContractParameters;
    try {
      const sim = await simulateLaunch({
        publicClient: input.publicClient,
        request,
      });
      simulatedRequest = sim.request;
    } catch (e) {
      return {
        ok: false,
        state: fail(
          callbacks,
          e instanceof Error ? e.message : 'Simulation failed.',
          { checklist, provenance: built.provenance },
        ),
      };
    }

    // 5) Wallet write — re-check account/chain
    patch({ phase: 'awaiting_wallet' });
    const live = input.getLiveAccount();
    if (!live.address) {
      return {
        ok: false,
        state: fail(callbacks, 'Wallet disconnected before confirmation.', {
          checklist,
          provenance: built.provenance,
        }),
      };
    }

    let hash: `0x${string}`;
    try {
      hash = await writeLaunchAfterSimulation({
        walletClient: input.walletClient,
        simulatedRequest,
        simulatedAccount: request.account,
        liveAccount: live.address,
        liveChainId: live.chainId,
      });
    } catch (e) {
      return {
        ok: false,
        state: fail(
          callbacks,
          e instanceof Error ? e.message : 'Wallet write failed.',
          { checklist, provenance: built.provenance },
        ),
      };
    }

    patch({ phase: 'submitted', txHash: hash });
    patch({ phase: 'confirming' });

    const receipt = await input.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      return {
        ok: false,
        state: fail(callbacks, 'Launch transaction reverted on-chain.', {
          checklist,
          provenance: built.provenance,
          txHash: hash,
        }),
      };
    }

    const decoded = decodeTokenLaunchedFromReceipt(receipt);
    if (!decoded.ok) {
      const successPending: LaunchTxState = {
        ...INITIAL_LAUNCH_TX_STATE,
        phase: 'receipt_success_details_pending',
        error: null,
        txHash: hash,
        expectedCreatorId: built.params.creatorId,
        expectedDeployer: input.liveAddress.toLowerCase() as `0x${string}`,
        decoded: null,
        detailsPending: true,
        provenance: built.provenance,
        checklist,
      };
      callbacks.onPhase(successPending);
      return { ok: true, txHash: hash, state: successPending };
    }

    if (!assertCreatorIdMatches(built.params.creatorId, decoded.decoded)) {
      return {
        ok: false,
        state: fail(
          callbacks,
          'Critical: on-chain creatorId does not match launch parameters.',
          {
            checklist,
            provenance: built.provenance,
            txHash: hash,
            decoded: decoded.decoded,
          },
        ),
      };
    }
    if (
      !assertDeployerMatches(
        input.liveAddress,
        decoded.decoded,
      )
    ) {
      return {
        ok: false,
        state: fail(
          callbacks,
          'Critical: on-chain deployer does not match signing wallet.',
          {
            checklist,
            provenance: built.provenance,
            txHash: hash,
            decoded: decoded.decoded,
          },
        ),
      };
    }

    const success: LaunchTxState = {
      ...INITIAL_LAUNCH_TX_STATE,
      phase: 'receipt_success',
      error: null,
      txHash: hash,
      expectedCreatorId: built.params.creatorId,
      expectedDeployer: input.liveAddress.toLowerCase() as `0x${string}`,
      decoded: decoded.decoded,
      detailsPending: false,
      provenance: built.provenance,
      checklist,
    };
    callbacks.onPhase(success);
    return { ok: true, txHash: hash, state: success };
  } catch (e) {
    return {
      ok: false,
      state: fail(
        callbacks,
        e instanceof Error ? e.message : 'Launch failed.',
      ),
    };
  }
}
