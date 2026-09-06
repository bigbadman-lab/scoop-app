import ScoopFactory from './abi/ScoopFactory.json' with { type: 'json' };
import ScoopToken from './abi/ScoopToken.json' with { type: 'json' };
import ScoopCreatorRewards from './abi/ScoopCreatorRewards.json' with { type: 'json' };
import ScoopCreatorRegistry from './abi/ScoopCreatorRegistry.json' with { type: 'json' };
import ScoopQuoteRegistry from './abi/ScoopQuoteRegistry.json' with { type: 'json' };
import ScoopPriceOracle from './abi/ScoopPriceOracle.json' with { type: 'json' };
import ScoopFeeDistributor from './abi/ScoopFeeDistributor.json' with { type: 'json' };
import ScoopLiquidityLocker from './abi/ScoopLiquidityLocker.json' with { type: 'json' };
import PoolManagerFragment from './abi/PoolManager.fragment.json' with { type: 'json' };
import PositionManagerFragment from './abi/PositionManager.fragment.json' with { type: 'json' };

export const scoopAbis = {
  ScoopFactory,
  ScoopToken,
  ScoopCreatorRewards,
  ScoopCreatorRegistry,
  ScoopQuoteRegistry,
  ScoopPriceOracle,
  ScoopFeeDistributor,
  ScoopLiquidityLocker,
  PoolManagerFragment,
  PositionManagerFragment,
} as const;

export type ScoopAbiName = keyof typeof scoopAbis;
