import ScoopFactory from './abi/ScoopFactory.json' with { type: 'json' };
import ScoopFactoryHistoricalCanary from './abi/ScoopFactory.historical-canary.json' with {
  type: 'json',
};
import ScoopToken from './abi/ScoopToken.json' with { type: 'json' };
import ScoopCreatorRewards from './abi/ScoopCreatorRewards.json' with { type: 'json' };
import ScoopCreatorRegistry from './abi/ScoopCreatorRegistry.json' with { type: 'json' };
import ScoopQuoteRegistry from './abi/ScoopQuoteRegistry.json' with { type: 'json' };
import ScoopPriceOracle from './abi/ScoopPriceOracle.json' with { type: 'json' };
import ScoopFeeDistributor from './abi/ScoopFeeDistributor.json' with { type: 'json' };
import ScoopFeeDistributorHistoricalCanary from './abi/ScoopFeeDistributor.historical-canary.json' with {
  type: 'json',
};
import ScoopLiquidityLocker from './abi/ScoopLiquidityLocker.json' with { type: 'json' };
import ScoopHolderRewards from './abi/ScoopHolderRewards.json' with { type: 'json' };
import ScoopLaunchDeployer from './abi/ScoopLaunchDeployer.json' with { type: 'json' };
import ScoopTokenDeployer from './abi/ScoopTokenDeployer.json' with { type: 'json' };
import PoolManagerFragment from './abi/PoolManager.fragment.json' with { type: 'json' };
import PositionManagerFragment from './abi/PositionManager.fragment.json' with {
  type: 'json',
};

/**
 * Canonical P3 ABIs (scoop-protocol @ 0157a9b) plus historical canary ABIs
 * for decoding / calling the pre-redeploy HELLO stack.
 */
export const scoopAbis = {
  ScoopFactory,
  ScoopFactoryHistoricalCanary,
  ScoopToken,
  ScoopCreatorRewards,
  ScoopCreatorRegistry,
  ScoopQuoteRegistry,
  ScoopPriceOracle,
  ScoopFeeDistributor,
  ScoopFeeDistributorHistoricalCanary,
  ScoopLiquidityLocker,
  ScoopHolderRewards,
  ScoopLaunchDeployer,
  ScoopTokenDeployer,
  PoolManagerFragment,
  PositionManagerFragment,
} as const;

export type ScoopAbiName = keyof typeof scoopAbis;
