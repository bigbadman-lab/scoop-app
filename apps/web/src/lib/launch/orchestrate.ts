/**
 * Final launch orchestration (V2.C / V2.G).
 * Pin → resolve creator → build params → fee → resolve buy → simulate → write → receipt.
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
  assertInitialBuyMatches,
  decodeInitialBuyFromReceipt,
  decodeTokenLaunchedFromReceipt,
} from '@/lib/launch/decode-launch';
import { resolveDevBuyIntent } from '@/lib/launch/dev-buy';
import { ensureArtworkPinned } from '@/lib/launch/ensure-ipfs';
import {
  prepareAndSimulateLaunchWrite,
  readLaunchFeeWei,
  shortenLaunchError,
  writeLaunchAfterSimulation,
  SCOOP_FACTORY_ADDRESS,
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
      displayImagePath:
        pinned.displayImagePath ?? input.state.image.displayImagePath ?? null,
    };
    const pathChanged =
      imageAfterPin.displayImagePath !== input.state.image.displayImagePath;
    if (!pinned.reused || pathChanged || input.state.image.ipfsUri !== pinned.ipfsUri) {
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

    // 3) Authoritative fee + ETH buy intent
    const { feeWei } = await readLaunchFeeWei(input.publicClient);
    const buyIntent = resolveDevBuyIntent(stateForParams, built.params.quoteAsset);
    if (!buyIntent.ok) {
      return {
        ok: false,
        state: fail(callbacks, buyIntent.error, {
          provenance: built.provenance,
        }),
      };
    }

    // 4) Simulate (probe+final for buy; single for launch)
    patch({ phase: 'simulating' });
    let simulatedRequest: WriteContractParameters;
    let prepared: Awaited<
      ReturnType<typeof prepareAndSimulateLaunchWrite>
    >['prepared'];
    try {
      const sim = await prepareAndSimulateLaunchWrite({
        publicClient: input.publicClient,
        params: built.params,
        account: input.liveAddress,
        launchFeeWei: feeWei,
        quoteAmountIn: buyIntent.quoteAmountInWei,
      });
      prepared = sim.prepared;
      simulatedRequest = sim.simulatedRequest;
    } catch (e) {
      return {
        ok: false,
        state: fail(
          callbacks,
          e instanceof Error ? e.message : 'Simulation failed.',
          { provenance: built.provenance },
        ),
      };
    }

    const checklist: LaunchChecklist = {
      chainId: ROBINHOOD_CHAIN_ID,
      factory: SCOOP_FACTORY_ADDRESS,
      functionName: prepared.functionName,
      signer: input.liveAddress.toLowerCase() as `0x${string}`,
      buyRecipient: input.liveAddress.toLowerCase() as `0x${string}`,
      creatorType: 'wallet',
      creatorSource: recipient.source,
      creatorWallet: recipient.address,
      creatorId: built.params.creatorId,
      quoteAsset: built.params.quoteAsset,
      launchFeeWei: feeWei.toString(),
      quoteAmountInWei: prepared.quoteAmountIn.toString(),
      expectedTokensOut: prepared.expectedTokensOut.toString(),
      minTokensOut: prepared.minTokensOut.toString(),
      slippageBps: prepared.slippageBps,
      msgValueWei: prepared.value.toString(),
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

    console.info(
      JSON.stringify({
        event: 'scoop_launch_checklist',
        ...checklist,
      }),
    );

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
        simulatedAccount: prepared.account,
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
    if (!assertDeployerMatches(input.liveAddress, decoded.decoded)) {
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

    if (prepared.functionName === 'launchAndBuy') {
      const buy = decodeInitialBuyFromReceipt(receipt);
      if (!buy.ok) {
        return {
          ok: false,
          state: fail(
            callbacks,
            'Critical: launchAndBuy succeeded without InitialBuyExecuted.',
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
        !assertInitialBuyMatches({
          decoded: buy.decoded,
          token: decoded.decoded.token,
          buyer: input.liveAddress,
          quoteAsset: built.params.quoteAsset,
          quoteAmountIn: prepared.quoteAmountIn,
        })
      ) {
        return {
          ok: false,
          state: fail(
            callbacks,
            'Critical: InitialBuyExecuted does not match launch request.',
            {
              checklist,
              provenance: built.provenance,
              txHash: hash,
              decoded: decoded.decoded,
            },
          ),
        };
      }
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
