import type { FeeKeeperMarket } from '@scoop/db';
import type { Address, PublicClient } from 'viem';
import {
  balanceForAction,
  hasNonZeroRelevantBalance,
  readDistributorBalances,
} from './balances.js';
import { distributionActionsForMarket } from './classify.js';
import {
  simulateCollectFees,
  writeCollectFees,
} from './collect.js';
import { decideMarketService } from './decide.js';
import {
  actionLabel,
  simulateDistribute,
  writeDistribute,
} from './distribute.js';
import { classifyError } from './errors.js';
import { logJson } from './log.js';
import { validateFeeKeeperMarket } from './validate.js';
import type { WriteGate } from './clients.js';

export type MarketOutcome = {
  token: string;
  status: 'skipped' | 'serviced' | 'failed';
  reason?: string;
  errorClass?: string;
  transactionsSent: number;
  gasUsed: bigint;
  stopWrites?: boolean;
};

export async function serviceMarket(input: {
  market: FeeKeeperMarket;
  publicClient: PublicClient;
  writeGate: WriteGate;
  nowSec: number;
  activityLookbackMinutes: number;
  fallbackSweepMinutes: number;
  cronWindowMinutes: number;
  account?: Address;
}): Promise<MarketOutcome> {
  const { market, publicClient, writeGate } = input;
  let transactionsSent = 0;
  let gasUsed = 0n;

  const baseLog = {
    token: market.tokenAddress,
    quoteAsset: market.quoteAsset,
    locker: market.liquidityLocker,
    feeDistributor: market.feeDistributor,
    lpTokenId: market.lpTokenId,
    lastTradeAt: market.lastTradeAt,
  };

  const validated = validateFeeKeeperMarket(market);
  if (!validated.ok) {
    const classified = classifyError({ code: validated.code, message: validated.message });
    logJson('warn', 'market_skip', {
      ...baseLog,
      decision: 'skip',
      reason: validated.code,
      errorClass: classified.errorClass,
      error: validated.message,
    });
    return {
      token: market.tokenAddress,
      status: 'skipped',
      reason: validated.code,
      errorClass: classified.errorClass,
      transactionsSent: 0,
      gasUsed: 0n,
    };
  }

  let balances;
  try {
    balances = await readDistributorBalances(publicClient, {
      feeDistributor: market.feeDistributor as Address,
      quoteAsset: market.quoteAsset,
      tokenAddress: market.tokenAddress,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logJson('error', 'market_balance_read_failed', {
      ...baseLog,
      errorClass: 'RETRYABLE',
      error: message,
    });
    return {
      token: market.tokenAddress,
      status: 'failed',
      reason: 'rpc_transient',
      errorClass: 'RETRYABLE',
      transactionsSent: 0,
      gasUsed: 0n,
    };
  }

  const hasBal = hasNonZeroRelevantBalance(
    balances,
    market.quoteAsset,
    market.tokenAddress,
  );

  const decision = decideMarketService({
    nowSec: input.nowSec,
    lastTradeAt: market.lastTradeAt,
    activityLookbackMinutes: input.activityLookbackMinutes,
    fallbackSweepMinutes: input.fallbackSweepMinutes,
    cronWindowMinutes: input.cronWindowMinutes,
    hasNonZeroDistributorBalance: hasBal,
  });

  if (decision.action === 'skip') {
    logJson('info', 'market_skip', {
      ...baseLog,
      decision: 'skip',
      reason: decision.reason,
    });
    return {
      token: market.tokenAddress,
      status: 'skipped',
      reason: decision.reason,
      transactionsSent: 0,
      gasUsed: 0n,
    };
  }

  const locker = market.liquidityLocker as Address;
  const lpTokenId = BigInt(market.lpTokenId);

  if (decision.action === 'collect_and_distribute') {
    const sim = await simulateCollectFees(publicClient, {
      locker,
      lpTokenId,
      account: input.account,
    });
    if (!sim.ok) {
      logJson('warn', 'collect_simulation_failed', {
        ...baseLog,
        decision: decision.action,
        reason: decision.reason,
        collectSimulation: 'revert',
        errorClass: 'ALERT',
        error: sim.error,
      });
      return {
        token: market.tokenAddress,
        status: 'failed',
        reason: 'collect_simulation_revert',
        errorClass: 'ALERT',
        transactionsSent: 0,
        gasUsed: 0n,
      };
    }

    if (!writeGate.enabled) {
      logJson('info', 'would_collect', {
        ...baseLog,
        decision: decision.action,
        reason: decision.reason,
        collectSimulation: 'ok',
        mode: 'dry-run',
      });
    } else {
      const written = await writeCollectFees(writeGate, publicClient, {
        locker,
        lpTokenId,
      });
      if (!written.ok) {
        logJson('error', 'collect_write_failed', {
          ...baseLog,
          collectTx: written.txHash,
          errorClass: 'ALERT',
          error: written.error,
        });
        return {
          token: market.tokenAddress,
          status: 'failed',
          reason: 'collect_write_failed',
          errorClass: 'ALERT',
          transactionsSent: written.txHash ? 1 : 0,
          gasUsed: 0n,
        };
      }
      transactionsSent += 1;
      gasUsed += written.receipt.gasUsed;
      logJson('info', 'collect_ok', {
        ...baseLog,
        collectTx: written.txHash,
        collectStatus: 'success',
        feesCollectedVerified: written.feesCollectedVerified,
        gasUsed: written.receipt.gasUsed.toString(),
      });
      // Refresh balances after collect
      balances = await readDistributorBalances(publicClient, {
        feeDistributor: market.feeDistributor as Address,
        quoteAsset: market.quoteAsset,
        tokenAddress: market.tokenAddress,
      });
    }
  }

  const actions = distributionActionsForMarket({
    quoteAsset: market.quoteAsset,
    tokenAddress: market.tokenAddress,
  });

  let distributeFail = false;
  for (const action of actions) {
    // In dry-run after would_collect, re-read isn't updated on-chain; still inspect current balances.
    const bal = balanceForAction(balances, action);
    if (bal === 0n) {
      logJson('info', 'distribution_skip_zero', {
        ...baseLog,
        distributionAsset: actionLabel(action),
        reason: 'zero_balance',
      });
      continue;
    }

    const sim = await simulateDistribute(publicClient, {
      feeDistributor: market.feeDistributor as Address,
      action,
      account: input.account,
    });
    if (!sim.ok) {
      if (sim.benignZero) {
        logJson('info', 'distribution_zero_balance_race', {
          ...baseLog,
          distributionAsset: actionLabel(action),
          errorClass: 'SKIP',
        });
        continue;
      }
      logJson('warn', 'distribute_simulation_failed', {
        ...baseLog,
        distributionAsset: actionLabel(action),
        errorClass: 'ALERT',
        error: sim.error,
      });
      distributeFail = true;
      // Do not blindly attempt later assets after a required simulation failure.
      break;
    }

    if (!writeGate.enabled) {
      logJson('info', 'would_distribute', {
        ...baseLog,
        distributionAsset: actionLabel(action),
        amount: bal.toString(),
        mode: 'dry-run',
      });
      continue;
    }

    const written = await writeDistribute(writeGate, publicClient, {
      feeDistributor: market.feeDistributor as Address,
      action,
    });
    if (!written.ok) {
      if (written.benignZero) {
        logJson('info', 'distribution_zero_balance_race', {
          ...baseLog,
          distributionAsset: actionLabel(action),
          distributionTx: written.txHash,
          errorClass: 'SKIP',
        });
        continue;
      }
      logJson('error', 'distribute_write_failed', {
        ...baseLog,
        distributionAsset: actionLabel(action),
        distributionTx: written.txHash,
        errorClass: 'ALERT',
        error: written.error,
      });
      distributeFail = true;
      // Stop sequential distributions after the first hard write failure.
      break;
    }
    transactionsSent += 1;
    gasUsed += written.receipt.gasUsed;
    logJson('info', 'distribute_ok', {
      ...baseLog,
      distributionAsset: actionLabel(action),
      distributionTx: written.txHash,
      eventVerified: written.eventVerified,
      gasUsed: written.receipt.gasUsed.toString(),
    });
  }

  if (distributeFail) {
    return {
      token: market.tokenAddress,
      status: 'failed',
      reason: 'collect_ok_distribute_fail',
      errorClass: 'ALERT',
      transactionsSent,
      gasUsed,
    };
  }

  logJson('info', 'market_serviced', {
    ...baseLog,
    decision: decision.action,
    reason: decision.reason,
    status: writeGate.enabled ? 'serviced' : 'dry_run',
    transactionsSent,
    gasUsed: gasUsed.toString(),
  });

  return {
    token: market.tokenAddress,
    status: 'serviced',
    reason: decision.reason,
    transactionsSent,
    gasUsed,
  };
}
