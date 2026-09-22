# SCOOP Protocol

**SCOOP turns what the market is talking about into markets people can trade.**

SCOOP is the product layer for discovery, news context, AI launch assistance and market UX. Users choose an execution rail:

1. **Solana → Pump.fun** — wallet-connected create on Pump.fun (SOL pair). SCOOP does not run a custom Solana AMM, Solana holder-rewards system, or Pump replacement protocol.
2. **Robinhood Chain → Pons** — launches on Robinhood Chain via Pons, with Uniswap v4 liquidity on that path.

> **Historical protocol documentation**
>
> Much of the numbered reference below describes SCOOP’s earlier Robinhood Chain-native protocol architecture (ScoopFactory, FeeDistributor, locks, holder rewards, and the legacy 70/4/20/6 fee split). SCOOP now operates a dual-rail launch model using **Pump.fun on Solana** and **Pons on Robinhood Chain**. That material is retained for transparency and technical history.
>
> Current product behaviour: AI-assisted news launches, cross-chain discovery, Solana creator-fee claiming via `/account`, and selective creator-reward recycling into standout markets (see **§24**). Solana / Pump.fun product behaviour is summarised in **§23**.

`scoop.fun` is the first interface on this dual-rail product.

---

## Contents

1. Protocol Overview
2. How SCOOP Works
3. Launching a Market
4. Market Economics
5. Creator Identity
6. Holder Rewards
7. Quote Assets & Stock Pairing
8. Price Oracle
9. Trading & Liquidity
10. Protocol Architecture
11. Canonical Deployment
12. Protocol Contracts
13. Authorities & Recipients
14. Indexer & Market Data
15. API
16. Protocol Events
17. Build on SCOOP
18. Security & Administrative Boundaries
19. Developer Resources
20. Protocol Design Principles
21. Current Implementation Notes
22. Risk Disclosure & Disclaimer
23. Solana / Pump.fun Launches
24. Creator Rewards Power Stronger Markets

---

# 1. Protocol Overview

> **Historical protocol documentation**
>
> This section describes SCOOP’s earlier Robinhood Chain-native protocol architecture. SCOOP now operates a dual-rail launch model using Pump.fun on Solana and Pons on Robinhood Chain. The material below is retained for transparency and technical history.
>
> **Scope:** Robinhood Chain → Pons remains the current RHC execution rail. The ScoopFactory / Uniswap v4 fee-distributor stack below is historical architecture, not the active public launch path.

SCOOP is a permissionless token launch and market protocol built on Uniswap v4 for Robinhood Chain.

The protocol allows anyone to create a fixed-supply token, launch an onchain market against a supported quote asset and configure how trading fees are distributed between creators, deployers and token holders.

Markets can trade against native ETH, SCOOP ecosystem assets and supported stock tokens, creating a common launch architecture for markets built around companies, news, narratives and ideas.

SCOOP coordinates:

- token deployment;
- market creation;
- initial liquidity;
- creator identity;
- fee distribution;
- holder rewards;
- quote-asset support; and
- launch-time pricing.

Trading and liquidity are provided by Uniswap v4.

SCOOP contracts are non-custodial and non-upgradeable. Once an individual market has launched, its core economic configuration cannot be rewritten by SCOOP or the deployer.

---

# 2. How SCOOP Works

> **Historical protocol documentation**
>
> This section describes SCOOP’s earlier Robinhood Chain-native protocol architecture. SCOOP now operates a dual-rail launch model using Pump.fun on Solana and Pons on Robinhood Chain. The material below is retained for transparency and technical history.

A SCOOP market moves through five core stages.

## 2.1 Configure

The deployer chooses the market configuration.

This includes:

- token name;
- token symbol;
- metadata;
- creator identity;
- quote asset;
- creator allocation destination;
- optional additional trading fee;
- additional-fee destination; and
- optional initial purchase.

At protocol level, a creator can be represented by either a wallet or an X identity.

## 2.2 Launch

The deployer submits the launch to `ScoopFactory`.

The Factory coordinates the complete launch atomically.

It:

1. validates the launch configuration;
2. validates the selected quote asset;
3. obtains its USD reference price;
4. deploys the fixed-supply token;
5. deploys the market's supporting contracts;
6. calculates initial pricing;
7. initializes the Uniswap v4 pool;
8. creates the initial liquidity position;
9. permanently locks that position;
10. registers creator economics where required; and
11. optionally executes an initial purchase.

The one-time protocol launch fee is:

**0.0005 ETH**

## 2.3 Trade

After launch, the market is a Uniswap v4 pool.

SCOOP markets do not require traders to use scoop.fun. Compatible applications and routers can interact with the underlying pool directly.

Every market has a fixed **1% base trading fee**.

The deployer may add an additional **0%–2% fee**, configurable in **0.1% increments**.

The resulting total pool fee is therefore between:

**1% and 3%**

## 2.4 Distribute

LP fees generated by trading accrue to the market's permanently locked liquidity position.

Those fees can be collected and passed to the market's dedicated `ScoopFeeDistributor`.

The base-fee portion is allocated:

- 70% Creator allocation;
- 4% Deployer;
- 20% Protocol;
- 6% Operations.

The Creator allocation can be directed to either the Creator or Holders.

Any additional fee is routed entirely to one of:

- Creator;
- Deployer; or
- Holders.

## 2.5 Reward

Creator rewards are associated with a deterministic `creatorId`.

This allows rewards to accrue to either a wallet identity or an X identity.

Holder Rewards use dedicated per-market vaults and Merkle-based distribution rounds.

---

# 3. Launching a Market

> **Historical protocol documentation**
>
> This section describes SCOOP’s earlier Robinhood Chain-native launch mechanics (`ScoopFactory`). The current public RHC rail is **Pons**. Solana launches route through **Pump.fun**. The material below is retained for transparency and technical history.

The canonical entry point for a SCOOP launch is `ScoopFactory`.

A launch is an atomic transaction that creates the token, its supporting infrastructure, the Uniswap v4 pool and its permanently locked initial liquidity.

## Launch Configuration

The onchain launch configuration includes:

| Field | Purpose |
| --- | --- |
| `name` | Token name |
| `symbol` | Token symbol |
| `creatorId` | Creator identity |
| `quoteAsset` | Selected quote asset |
| `metadata` | Description, image and supported links |
| `salt` | Deterministic deployment salt |
| `additionalFee` | Optional additional fee |
| `creatorAllocationDestination` | Creator or Holders |
| `additionalFeeDestination` | Creator, Deployer or Holders |

The creator ID must be non-zero.

The quote asset must be registered and enabled by `ScoopQuoteRegistry`.

Metadata validation is performed onchain for supported URI and link formats.

## Launch Sequence

A successful launch follows this sequence:

```text
Launch request
      ↓
Validate creator + economics + metadata
      ↓
Validate quote asset
      ↓
Deploy ScoopToken
      ↓
Deploy HolderRewards
      ↓
Deploy FeeDistributor
      ↓
Deploy LiquidityLocker
      ↓
Register creator reward source where required
      ↓
Read quote/USD oracle price
      ↓
Calculate initial market pricing
      ↓
Initialize Uniswap v4 pool
      ↓
Mint one-sided liquidity position
      ↓
Transfer LP position to LiquidityLocker
      ↓
Burn residual token dust
      ↓
Record launch + emit events
      ↓
Optional initial purchase
```

## Launch and Buy

The Factory exposes two primary launch paths:

```solidity
launch(...)
```

and:

```solidity
launchAndBuy(...)
```

`launchAndBuy` allows an exact-input initial purchase to be executed as part of the launch transaction.

At protocol level, native and ERC-20 quote assets can be used by the launch-and-buy path where the required conditions are satisfied.

The scoop.fun interface may expose a narrower set of launch options than the underlying protocol.

## Token Supply

Every `ScoopToken` has:

```text
Maximum supply: 1,000,000,000
Decimals:       18
Additional minting: None
Owner:          None
Pause:          None
Transfer tax:   None
```

The supply is minted once during deployment.

The launch process uses the supply to establish the market's initial liquidity, with residual launch dust sent to the burn address.

---

# 4. Market Economics

> **Historical protocol documentation**
>
> This section describes SCOOP’s earlier Robinhood Chain-native protocol fee split (70% Creator / 4% Deployer / 20% Protocol / 6% Operations). That allocation is **not** the current dual-rail product economics. SCOOP now operates Pump.fun on Solana and Pons on Robinhood Chain; selective creator-reward recycling is documented in **§24**. The material below is retained for transparency and technical history.

Every SCOOP market has its economics established at launch.

## Base Trading Fee

Every market has a fixed:

**1% base trading fee**

When LP fees are harvested, the base portion is divided:

| Allocation | Share |
| --- | ---: |
| Creator allocation | 70% |
| Deployer | 4% |
| Protocol | 20% |
| Operations | 6% |
| **Total** | **100%** |

The 70% Creator allocation can be directed to either:

**Creator**

or:

**Holders**

This choice is permanent for that market.

## Additional Trading Fee

The deployer can optionally configure an additional fee between:

**0% and 2%**

It can only be configured in:

**0.1% increments**

Valid examples include:

```text
0%
0.1%
0.2%
0.3%
...
1.0%
...
2.0%
```

The entire additional portion is directed to one destination:

- Creator;
- Deployer; or
- Holders.

The additional portion is not divided using the base 70/4/20/6 allocation.

## Total Trading Fee

Because the base fee is always 1%:

```text
Minimum total fee: 1%
Maximum total fee: 3%
```

For example:

```text
Base fee:       1%
Additional fee: 1% → Holders

Total pool fee: 2%
```

## Fee Collection

Trading fees are Uniswap v4 LP fees earned by the permanently locked liquidity position.

```text
Trade
  ↓
Uniswap v4 pool
  ↓
LP fees accrue
  ↓
ScoopLiquidityLocker
  ↓
ScoopFeeDistributor
  ├── Creator / Holders
  ├── Deployer
  ├── Protocol
  └── Operations
```

Collection and distribution are permissionless onchain operations.

SCOOP-operated infrastructure may automate them, but privileged SCOOP intervention is not required.

## Fee Assets

Fees can accrue in both currencies of the Uniswap v4 pool.

Depending on the market, harvested assets can therefore include:

- the launched token;
- native ETH; or
- an ERC-20 quote asset.

Fees should not be assumed to accrue exclusively in ETH or exclusively in the quote asset.

---

# 5. Creator Identity

SCOOP separates creator identity from the wallet that deploys a market.

Every launch contains a `creatorId`.

When the Creator allocation path is selected, this identity determines who is entitled to the creator portion of trading fees.

SCOOP supports:

- Wallet identities;
- X identities.

## Wallet Creators

A wallet creator ID is deterministically derived from the wallet address.

Conceptually:

```text
creatorId = hash(Wallet, walletAddress)
```

The wallet itself is the payout destination.

No separate registration is required.

## X Creators

An X creator ID is derived from the stable numeric X user ID:

```text
creatorId = hash(X, xUserId)
```

SCOOP deliberately uses the underlying numeric user ID rather than the `@handle`.

Handles can change while the underlying account identity remains stable.

X handles are not stored in the SCOOP smart contracts.

## Rewards Before Claim

A market can attribute creator economics to an X identity before that person has connected a wallet to SCOOP.

Rewards can begin accumulating against the corresponding `creatorId`.

They remain associated with that identity until it is successfully resolved to a wallet.

## Claiming an X Identity

The creator proves control of the relevant X identity through SCOOP's verification flow.

Following successful verification, the Verification Authority signs an EIP-712 claim connecting:

```text
X user ID
    ↓
creatorId
    ↓
wallet
```

The signed claim is submitted to `ScoopCreatorRegistry`.

Once accepted, the X identity is permanently bound to that wallet.

The protocol does not provide a mechanism to transfer, revoke or rebind an already claimed X identity.

## Creator Rewards

`ScoopCreatorRewards` acts as the shared creator reward escrow.

Authorised market Fee Distributors can credit ETH and ERC-20 rewards against a `creatorId`.

Once that creator identity resolves to a wallet, accumulated rewards can be claimed.

For an unclaimed X creator, rewards can continue to accumulate but cannot be withdrawn until identity resolution has completed.

---

# 6. Holder Rewards

A SCOOP market can direct trading-fee economics to its token holders.

Holder Rewards can receive funds from:

1. the 70% Creator allocation; and/or
2. the optional additional trading fee.

Each market has its own `ScoopHolderRewards` vault.

## Funding

```text
Trading activity
      ↓
LP fees
      ↓
ScoopLiquidityLocker
      ↓
ScoopFeeDistributor
      ↓
ScoopHolderRewards
```

Because LP fees can accrue in either pool currency, Holder Rewards may contain multiple reward assets.

## Eligibility

Holder balances are reconstructed from onchain ERC-20 `Transfer` activity.

Protocol and system addresses are excluded where appropriate so infrastructure balances are not treated as ordinary market participants.

Core exclusions include:

- zero address;
- burn address;
- launched token;
- Holder Rewards vault;
- Fee Distributor;
- Liquidity Locker.

Additional system exclusions may be applied by the production reward calculation.

## Reward Rounds

The current Holder Rewards infrastructure is designed around discrete rounds.

The current worker implementation calculates hourly rounds using the latest completed hour.

For each round:

```text
Holder balances
      ↓
Eligibility
      ↓
Pro-rata calculation
      ↓
Merkle tree
      ↓
Merkle root
      ↓
Onchain publication
```

Rounding dust is allocated deterministically so the complete distributable amount can be accounted for.

## Claims

The authorised Root Publisher publishes the completed Merkle root to the market's `ScoopHolderRewards` contract.

Eligible holders can then submit their proof.

The smart contract verifies that proof against the published root before releasing the reward.

Rewards can be paid through:

- holder-initiated `claim`; or
- `pushBatch`.

Published entitlements do not currently have an onchain expiry.

## Trust Boundary

Holder Rewards deliberately combine onchain custody and verification with offchain calculation.

**Onchain**

- custody reward assets;
- record reward roots;
- verify Merkle proofs;
- prevent duplicate payment;
- execute claims.

**Offchain**

- reconstruct balances;
- determine eligibility;
- calculate entitlements;
- construct Merkle trees;
- store proofs;
- submit completed roots through the authorised publisher.

---

# 7. Quote Assets & Stock Pairing

Every SCOOP market trades against a supported quote asset.

Instead of forcing every launch into the same pair, SCOOP allows the deployer to choose from assets enabled by the protocol.

Examples include:

```text
TOKEN / ETH
TOKEN / USDG
TOKEN / AAPL
TOKEN / NVDA
TOKEN / TSLA
```

## Supported Quotes

The canonical production catalogue contains **22 quote assets**:

- native ETH;
- USDG;
- 20 supported stock tokens.

Current stock-token symbols are:

| Symbol | Type |
| --- | --- |
| AAPL | Stock |
| AMD | Stock |
| AMZN | Stock |
| ASML | Stock |
| BABA | Stock |
| COIN | Stock |
| CRCL | Stock |
| GME | Stock |
| GOOGL | Stock |
| INTC | Stock |
| META | Stock |
| MSFT | Stock |
| MSTR | Stock |
| MU | Stock |
| NVDA | Stock |
| PLTR | Stock |
| SNDK | Stock |
| SPCX | Stock |
| TSLA | Stock |
| TSM | Stock |

An asset must be registered and enabled by `ScoopQuoteRegistry` before it can be used for a new launch.

## Quote Types

The protocol supports quote classifications:

```text
Native
Scoop
Stock
Pons
```

Native ETH is represented by the zero address.

ERC-20 quotes use their token contract address.

## What Stock Pairing Means

For:

```text
TOKEN / NVDA
```

the supported NVDA stock token is the quote currency in the Uniswap v4 pool.

It does **not** mean that the launched SCOOP token:

- represents NVIDIA shares;
- is backed by NVIDIA shares;
- tracks NVIDIA's share price;
- gives ownership of NVIDIA;
- provides shareholder or dividend rights; or
- is issued, approved or endorsed by NVIDIA.

Stock pairing describes the asset against which the SCOOP token trades.

## Quote Availability

The Registry Authority can disable a quote asset for new launches.

This does not remove or reconfigure an existing Uniswap v4 market using that asset.

---

# 8. Price Oracle

`ScoopPriceOracle` provides the USD reference price used when a new market launches.

It does not determine the ongoing market price of the launched token.

## Launch Pricing

```text
Quote asset
     ↓
ScoopPriceOracle
     ↓
Quote/USD price
     ↓
Launch pricing
     ↓
Initial pool price + ticks
     ↓
Uniswap v4 initialization
```

The current launch architecture targets an initial fully diluted valuation of approximately:

**$5,000**

Once launched, the token's price is determined by its Uniswap v4 pool.

## Feed Validation

The oracle uses AggregatorV3-compatible price feeds and normalizes valid USD prices to:

```text
1e18 = $1.00
```

Each feed has a maximum permitted age.

Canonical configuration currently uses:

| Quote category | Maximum age |
| --- | ---: |
| ETH | 86,400 seconds |
| USDG | 86,400 seconds |
| Stock tokens | 345,600 seconds |

A stale, disabled or invalid feed prevents a new launch that requires that price.

## Oracle Administration

The Oracle Authority can:

- configure feeds;
- enable or disable feeds;
- change permitted maximum age.

Configured feed identity is write-once.

These powers affect new launch pricing. They do not control the ongoing trading price of an existing market.

---

# 9. Trading & Liquidity

After launch, a SCOOP market is a Uniswap v4 pool.

## Pool Configuration

SCOOP markets use:

```text
Uniswap v4
Tick spacing: 10
Hooks:         none
Pool fee:      1% base + configured additional fee
```

There is no proprietary SCOOP hook required for swaps.

SCOOP's market infrastructure operates around the pool through launch coordination, locked liquidity, fee distribution and rewards.

## Trading

At protocol level, a trade is a swap between the launched token and its quote asset.

For:

```text
TOKEN / ETH
```

the assets exchanged are TOKEN and ETH.

For:

```text
TOKEN / AAPL
```

the assets exchanged are TOKEN and the supported AAPL quote token.

Compatible Uniswap v4 integrations can interact with these pools directly.

## Price

SCOOP does not set a continuing token price after launch.

The market price is determined by pool state and trading activity.

The SCOOP indexer can derive indexed market-data views from that activity.

## Slippage

Trades are subject to normal automated-market-maker risks including slippage.

Execution can depend on:

- trade size;
- liquidity;
- current pool state;
- transaction ordering; and
- minimum-output settings.

## Permanent Initial Liquidity

Every launch creates a one-sided Uniswap v4 liquidity position.

The resulting PositionManager NFT is transferred to the market's dedicated `ScoopLiquidityLocker`.

The locker does not expose functionality to:

- transfer the LP position;
- withdraw principal liquidity; or
- replace the configured Fee Distributor.

The deployer therefore cannot subsequently retrieve the initial liquidity position.

## Principal vs Fees

```text
LP POSITION
    │
    ├── Principal
    │      ↓
    │   Permanently locked
    │
    └── LP fees
           ↓
       Collectable
           ↓
     FeeDistributor
```

Collecting LP fees does not remove the underlying liquidity principal.

---

# 10. Protocol Architecture

SCOOP is deployed on:

```text
Network:  Robinhood Chain Mainnet
Chain ID: 4663
```

The architecture has two layers:

**Global protocol contracts** shared across SCOOP.

**Per-market contracts** created for every launch.

## Architecture Overview

```text
                         SCOOP PROTOCOL
                              │
                              ▼
                        ScoopFactory
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
   TokenDeployer       QuoteRegistry          PriceOracle
          │                   │                    │
          ▼                   └────────┬───────────┘
      ScoopToken                      │
                                      ▼
                               Launch pricing
                                      │
                  ┌───────────────────┴─────────────────┐
                  │                                     │
                  ▼                                     ▼
            LaunchDeployer                         Uniswap v4
                  │                                     │
                  ├── HolderRewards                     ├── PoolManager
                  ├── FeeDistributor                    ├── PositionManager
                  └── LiquidityLocker                   ├── UniversalRouter
                                                        └── Permit2
```

Fee flow:

```text
Uniswap v4
    ↓
LiquidityLocker
    ↓
FeeDistributor
    ├── Creator / Holders
    ├── Deployer
    ├── Protocol
    └── Operations
```

Creator identity:

```text
Wallet ───────────────┐
                      ▼
                CreatorRegistry
                      ▲
X identity ───────────┘
                      │
                      ▼
                  creatorId
                      │
                      ▼
                CreatorRewards
```

---

# 11. Canonical Deployment

The following addresses represent the canonical P10.3 production deployment on Robinhood Chain mainnet.

## SCOOP Contracts

| Contract | Address |
| --- | --- |
| `ScoopFactory` | `0x4B227d5E6199f42ceA4e638875fF8C740757DD3C` |
| `ScoopCreatorRegistry` | `0xC99ec41AAe874B02D6e7392B43b713B6dD2E03C2` |
| `ScoopCreatorRewards` | `0xdB80eED1d52c8c80Ae3E221C85dA94319132f6EF` |
| `ScoopTokenDeployer` | `0x259D3f3474fD192174BC245feb6d676CC4Fe4379` |
| `ScoopLaunchDeployer` | `0x3f6dF184ff86F32bf431c7Aff5267d1C899DAcBd` |
| `ScoopFactoryDeployer` | `0x4c9DE09250026228C6869881F7FF07125aA096D4` |
| `ScoopQuoteRegistry` | `0xE3782bef83cfB17B5a84B2649405a944dc58e40C` |
| `ScoopPriceOracle` | `0x346a84fbAB49a50a2255F2808fd6BCe812DaFe5c` |

## Uniswap v4 Infrastructure

| Component | Address |
| --- | --- |
| `PoolManager` | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| `PositionManager` | `0x58daec3116aae6D93017bAAea7749052E8a04fA7` |
| `UniversalRouter` | `0x8876789976dEcBfCbBbe364623C63652db8C0904` |
| `Permit2` | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Historical SCOOP deployments and development canaries should not be used as canonical production addresses.

---

# 12. Protocol Contracts

## ScoopFactory

`0x4B227d5E6199f42ceA4e638875fF8C740757DD3C`

Primary permissionless launch orchestrator.

It coordinates:

- validation;
- launch fee;
- token deployment;
- supporting contract deployment;
- quote validation;
- oracle pricing;
- pool initialization;
- liquidity creation;
- liquidity locking;
- creator registration; and
- optional initial purchase.

Primary launch functions:

```solidity
launch(...)
launchAndBuy(...)
```

The Factory has no owner and no upgrade function.

## ScoopCreatorRegistry

`0xC99ec41AAe874B02D6e7392B43b713B6dD2E03C2`

Provides deterministic Wallet and X creator identities and resolves those identities to payout wallets.

X claims require verification-authority signatures.

## ScoopCreatorRewards

`0xdB80eED1d52c8c80Ae3E221C85dA94319132f6EF`

Shared creator reward escrow.

Authorised market sources can credit ETH and ERC-20 rewards against creator IDs.

## ScoopTokenDeployer

`0x259D3f3474fD192174BC245feb6d676CC4Fe4379`

Deterministically deploys `ScoopToken` contracts using CREATE2.

## ScoopLaunchDeployer

`0x3f6dF184ff86F32bf431c7Aff5267d1C899DAcBd`

Creates each market's dedicated:

```text
ScoopHolderRewards
ScoopFeeDistributor
ScoopLiquidityLocker
```

## ScoopQuoteRegistry

`0xE3782bef83cfB17B5a84B2649405a944dc58e40C`

Defines the quote assets available for new launches.

## ScoopPriceOracle

`0x346a84fbAB49a50a2255F2808fd6BCe812DaFe5c`

Provides quote/USD pricing used by the launch process.

## ScoopFactoryDeployer

`0x4c9DE09250026228C6869881F7FF07125aA096D4`

Canonical deployment infrastructure used to deploy the Factory and Creator Rewards architecture.

It is not normally part of end-user interaction.

## Per-Market Contracts

Every launch creates:

### ScoopToken

Fixed-supply ERC-20 representing the launched market token.

### ScoopFeeDistributor

Contains the market's immutable fee configuration and routes harvested LP fees.

### ScoopLiquidityLocker

Permanently holds the Uniswap v4 PositionManager NFT and allows accrued LP fees to be collected.

### ScoopHolderRewards

Receives holder-directed rewards and verifies claims against published Merkle roots.

---

# 13. Authorities & Recipients

SCOOP does not have general administrative ownership over launched markets, but several narrowly scoped global functions have designated authorities.

## Authorities

| Authority | Address | Scope |
| --- | --- | --- |
| Root Publisher | `0xe37C1c028201054461d0F283896B56552b054B29` | Holder Rewards roots |
| Registry Authority | `0x54dCe3F53bbe3fBa3d1035E045a8a4de850eDcE7` | Quote assets |
| Oracle Authority | `0x54dCe3F53bbe3fBa3d1035E045a8a4de850eDcE7` | Price feeds |
| Verification Authority | `0xe176aCa5227F4c59c843cD0f2BAef21924DbfFE8` | X identity claims |

## Recipients

| Recipient | Address | Purpose |
| --- | --- | --- |
| Launch Fee Recipient | `0xCb2D4ceD82B5E9e013F4db58F999662052aE1FA3` | 0.0005 ETH launch fee |
| Protocol Vault | `0x4DD3fe45AD34A0De7182f51822246A2E4379bA15` | 20% base-fee protocol allocation |
| Operations | `0x17CD9659e8cB03c49F9C631218f57d65089d7C95` | 6% base-fee operations allocation |

These recipients are immutable dependencies of the canonical Factory architecture.

---

# 14. Indexer & Market Data

SCOOP Protocol is onchain.

The SCOOP indexer is a separate read layer that transforms blockchain activity into structured data for scoop.fun and other consumers.

```text
Robinhood Chain
      │
      ├── SCOOP events
      ├── Uniswap v4 events
      └── ERC-20 Transfer events
                │
                ▼
          SCOOP Indexer
                │
                ▼
           PostgreSQL
                │
                ▼
            API layer
                │
                ▼
            scoop.fun
```

The blockchain remains authoritative.

## Indexed Activity

The indexer follows activity including:

- Factory launches;
- pool initialization;
- swaps;
- token transfers;
- fee distributions;
- creator rewards;
- Holder Reward deposits;
- reward rounds;
- claims.

It builds read models for:

- tokens;
- markets;
- trades;
- candles;
- holders;
- market statistics.

## Reliability

The indexer maintains persistent checkpoints and processed-block tracking.

A singleton database lock prevents multiple active workers from independently writing the same canonical stream.

The architecture also supports reorg handling and rebuilding affected projections from blockchain activity.

## Onchain vs Offchain Data

Much of SCOOP market state can be reconstructed from blockchain events.

Some application data remains offchain, including:

- news content;
- X handles and profile presentation;
- uploaded media;
- AI-generated content;
- Holder Reward Merkle proofs;
- external data sources.

## Market Data

### Price

Trade execution price is derived from token and quote amounts exchanged in Uniswap v4 swaps.

Current pool pricing can also be derived from Uniswap v4 pool state.

### FDV

SCOOP primarily uses **fully diluted valuation** rather than circulating market capitalization.

```text
FDV = token price × total token supply
```

### Volume

Volume is derived from indexed swap activity.

Where suitable quote/USD data is available, quote-denominated activity can also be represented in USD.

### Candles

Supported candle intervals include:

```text
5s
1m
5m
15m
1h
4h
1d
```

OHLCV candles are derived from executed trades.

### Holders

Holder balances are reconstructed from ERC-20 `Transfer` events.

Known system addresses can be excluded from retail-holder views.

## Numeric Conventions

| Data | Convention |
| --- | --- |
| Raw integers | Decimal strings |
| X18 values | `1e18 = 1.0` |
| Addresses | Lowercase normalized |
| Timestamps | Unix seconds |
| Primary valuation | FDV |

---

# 15. API

scoop.fun exposes application APIs under:

```text
https://scoop.fun/api/...
```

These APIs provide convenient access to indexed SCOOP data.

They are not a replacement for direct blockchain verification.

## Health

```text
GET /api/health
GET /api/indexer/health
```

## Tokens

```text
GET /api/tokens
GET /api/tokens/[address]
```

Token views can include identity, quote asset, price, FDV, volume, trades, holders and launch state.

## Trades

```text
GET /api/tokens/[address]/trades
```

Returns indexed Uniswap v4 swap activity associated with the market.

## Candles

```text
GET /api/tokens/[address]/candles
```

Supported intervals:

```text
5s
1m
5m
15m
1h
4h
1d
```

Default result limit:

```text
100
```

Maximum:

```text
500
```

## Holders

```text
GET /api/tokens/[address]/holders
```

Returns indexed holder data reconstructed from token transfers.

## Discovery

```text
GET /api/markets
GET /api/discover
GET /api/rankings
```

## Creator Earnings

```text
GET /api/creators/[creatorId]/earnings
```

## Launch Lookup

```text
GET /api/launches/by-token?token=0x...
```

## Market Spot Data

```text
GET /api/market/spot
```

## News

```text
GET  /api/news
GET  /api/news/[providerArticleId]/markets
POST /api/news/article-markets
```

News APIs belong to the application layer rather than canonical protocol state.

## Account & Holder Rewards

Authenticated account infrastructure includes:

```text
/api/account
/api/account/me
/api/account/holder-rewards
```

Holder Reward proofs are supplied through the application layer.

The onchain contract independently verifies a submitted proof before payment.

## API Stability

Application APIs can evolve independently of the immutable protocol.

Integrators requiring long-term protocol-level compatibility should primarily rely on:

- canonical contracts;
- ABIs;
- protocol events;
- Robinhood Chain state.

When indexed API data conflicts with directly verifiable blockchain state:

**the blockchain is authoritative.**

---

# 16. Protocol Events

Protocol events provide a direct integration path for applications that do not want to depend on SCOOP's indexed API.

## Factory

```text
LaunchFeePaid
ScoopTokenCreated
LaunchEconomicsConfigured
TokenLaunched
InitialBuyExecuted
```

`TokenLaunched` is the canonical successful-launch signal.

## Deployment

```text
TokenDeployed
LaunchDeployed
```

## Uniswap v4

```text
Initialize
Swap
```

Swap events provide the underlying activity from which trade data can be reconstructed.

## ERC-20

```text
Transfer
```

Used to reconstruct token movement and holder balances.

## Fees

```text
FeesCollected
ETHDistributed
TokenDistributed
```

## Creator Identity & Rewards

```text
XIdentityClaimed
SourceRegistered
ETHCredited
TokenCredited
ETHClaimed
TokenClaimed
```

## Holder Rewards

```text
FeeDistributorInitialized
HolderRewardDeposited
HolderRewardRoundPublished
HolderRewardPushed
HolderRewardClaimed
HolderRewardPushFailed
```

## Quote Registry & Oracle

```text
QuoteRegistered
QuoteStatusChanged
PriceFeedConfigured
PriceFeedStatusChanged
MaxAgeUpdated
```

---

# 17. Build on SCOOP

SCOOP Protocol is permissionless.

scoop.fun is an interface to the protocol, not a requirement for interacting with it.

## Launch Directly

Third-party applications can submit valid launches directly to the canonical `ScoopFactory`.

```solidity
launch(...)
launchAndBuy(...)
```

The same onchain validation applies regardless of which interface submits the transaction.

No scoop.fun allowlist is required.

## Trade Directly

SCOOP markets are standard Uniswap v4 pools with no SCOOP hook.

Compatible Uniswap v4 infrastructure can interact with them directly.

## Discover Markets

Third-party indexers can discover launches from Factory events.

`TokenLaunched` provides the canonical launch signal.

The SCOOP API can also provide convenient indexed discovery.

## Inspect Economics

Market economics can be independently read from onchain state and events.

This includes:

- creator identity;
- quote asset;
- pool fee;
- additional fee;
- fee destinations;
- deployer;
- Fee Distributor;
- Holder Rewards vault;
- Liquidity Locker.

## Fee Maintenance

Fee collection and distribution functions are permissionless.

Third parties can trigger accrued fee collection and distribution without privileged SCOOP access.

## Creator Integration

Applications can derive Wallet and X creator IDs using the same deterministic identity scheme.

X wallet resolution requires the signed verification process recognised by `ScoopCreatorRegistry`.

## Holder Reward Integration

Third parties can inspect:

- reward deposits;
- published roots;
- claims;
- pushed distributions

directly onchain.

The corresponding Merkle proof must come from the infrastructure that calculated the reward round.

## SDK

SCOOP does not currently publish a dedicated third-party SDK.

Direct contract interaction using the canonical ABIs is the protocol-level integration path.

---

# 18. Security & Administrative Boundaries

SCOOP minimizes administrative control over individual markets after launch.

Permissionless creation does not mean every global protocol component is administration-free.

## Immutable Market Properties

After launch, SCOOP does not provide an administrator with the ability to change:

- token supply;
- deployer attribution;
- creator identity attribution;
- pool fee;
- additional trading fee;
- Creator allocation destination;
- additional-fee destination;
- Fee Distributor recipients;
- Liquidity Locker ownership;
- locked liquidity principal.

There is no proxy upgrade mechanism through which an existing market implementation can simply be replaced.

## Token Control

`ScoopToken` does not provide an administrator with functions to:

- mint additional supply;
- pause transfers;
- impose a transfer tax; or
- seize holder balances through token administration.

## Liquidity Control

The initial PositionManager NFT is held by `ScoopLiquidityLocker`.

The locker cannot transfer the NFT or withdraw the principal liquidity.

Accrued fees remain collectable.

## Global Administration

### Registry Authority

Can:

- register quote assets;
- enable or disable quote assets.

This affects availability for new launches.

### Oracle Authority

Can:

- configure price feeds;
- enable or disable feeds;
- change permitted maximum age.

This affects launch-time quote pricing.

### Verification Authority

Signs X identity claims.

It does not have general control over launched markets.

### Root Publisher

Publishes Holder Rewards Merkle roots.

This is an explicit trust boundary because reward entitlement calculation occurs offchain.

## Permissionless Operations

Operations that do not require privileged authority include:

- LP fee collection;
- Fee Distributor distribution;
- creator reward claims;
- valid Holder Reward claims;
- supported batch reward distribution.

---

# 19. Developer Resources

## Network

```text
Robinhood Chain Mainnet
Chain ID: 4663
```

## Canonical Factory

```text
0x4B227d5E6199f42ceA4e638875fF8C740757DD3C
```

## Protocol Source

```text
github.com/bigbadman-lab/scoop-protocol
```

## Application & Indexer Source

```text
github.com/bigbadman-lab/scoop-app
```

## Explorer

```text
explorer.mainnet.chain.robinhood.com
```

## API

```text
https://scoop.fun/api/...
```

## ABIs

Canonical contract ABIs are generated from the protocol's Foundry artifacts.

The scoop.fun application consumes the relevant interfaces through its contracts package.

Integrators should ensure the ABI they use corresponds to the canonical production deployment.

---

# 20. Protocol Design Principles

## Permissionless Creation

A valid market launch does not require approval from scoop.fun.

The Factory determines whether the transaction satisfies protocol rules.

## Markets Over Listings

A SCOOP launch creates an onchain market rather than an entry in a centralized listing database.

The token and Uniswap v4 pool continue to exist independently of scoop.fun.

## Immutable Economics

Market economics are established at launch and encoded into the deployed infrastructure.

## Permanent Initial Liquidity

Initial liquidity is permanently locked while the fees earned by that liquidity remain distributable.

## Composable Trading

SCOOP uses Uniswap v4 without proprietary hooks.

External applications can interact with the underlying pools.

## Identity Without Pre-Registration

Creator economics can be attributed to an identity before that creator has joined SCOOP.

## Onchain Settlement, Indexed Discovery

Protocol settlement happens onchain.

The indexer and API make that activity easier to discover and consume without replacing the blockchain as the canonical source.

---

# 21. Current Implementation Notes

The SCOOP Protocol and scoop.fun application operate at different layers.

A capability existing onchain does not necessarily mean that the current scoop.fun interface exposes it.

```text
Protocol capability
        ≠
Current interface capability
```

The canonical contracts determine protocol capability.

The interface, indexer, APIs and automated workers can evolve independently of already deployed markets.

At the time represented by this documentation, some application infrastructure is still being transitioned to the canonical production deployment.

Accordingly, developers should verify live application/indexer status before relying on scoop.fun operational services for production integrations.

Direct onchain state remains authoritative.

---

# 22. Risk Disclosure & Disclaimer

SCOOP is experimental blockchain software.

Using SCOOP involves risks associated with smart contracts, blockchain networks, automated-market-maker trading and third-party assets.

These risks can include:

- smart contract defects;
- integration defects;
- blockchain failures;
- oracle failures;
- transaction ordering;
- slippage;
- liquidity risk;
- unexpected token behaviour;
- third-party quote-asset risk;
- Uniswap v4 infrastructure risk;
- wallet compromise; and
- loss of funds.

Immutability reduces some forms of administrative control but also means an immutable deployed contract cannot simply be patched after launch.

## Stock-Paired Markets

A stock-token quote pair does not make the launched SCOOP token a share, security interest or ownership claim in the referenced company.

The existence of a stock-paired market does not imply approval, sponsorship or endorsement by the referenced company.

## Third-Party Quote Assets

SCOOP does not control the underlying design, backing, redemption mechanism, issuer or regulatory status of third-party quote assets.

Registration in `ScoopQuoteRegistry` should not be interpreted as a guarantee of value, solvency, liquidity or future availability.

## Creator Attribution

The selection of a creator identity for a market does not itself demonstrate that the person or account associated with that identity created, approved or endorsed the market.

This is particularly important for unclaimed X creator identities.

## Holder Rewards

Holder Reward assets are held and claims are verified onchain.

Eligibility and entitlement calculations are performed offchain and represented by Merkle roots published by the authorised Root Publisher.

Users should understand this trust boundary.

## No Advice

Nothing in this documentation constitutes financial, investment, legal, tax or other professional advice.

The existence of a SCOOP market, creator identity, stock-token pairing, news association or supported quote asset should not be interpreted as endorsement by SCOOP or by any person, company or organisation referenced by that market.

Users are responsible for understanding the transactions they sign and independently evaluating the assets, contracts and risks involved.

---

# 23. Solana / Pump.fun Launches

SCOOP’s Solana rail is a **product integration**, not a SCOOP-owned Solana protocol.

## Product layer

- Connect a Solana wallet (wallet-standard / Reown). SIWE account sessions remain Robinhood/EVM-specific and are not required for Pump creates.
- Launch UX on scoop.fun prepares and confirms a **create** transaction against Pump.fun.
- Markets pair with **SOL** on Pump.fun.
- After confirmation, SCOOP persists the mint and opens `/token/<mint>`.
- Creator fees from Pump markets accrue to the creator’s Solana wallet and can be claimed from **`/account`** after SIWS authentication.

## What SCOOP does not provide on Solana

- No custom Solana AMM or bonding curve owned by SCOOP
- No SCOOP Solana holder rewards, fee distributor, or locks
- No embedded Solana swap UI (token pages link out to Solana terminals)
- No create+buy atomic flow in the current public path
- No claim that scoop.fun indexes Pump candles or trade tape yet

## Market pages

Pump markets render with Solana / Pump.fun terminology (mint, Solana explorer, Pump.fun as launch venue/source). Primary trading CTAs open **Axiom** and **GMGN** using the mint. Robinhood markets continue to use Robinhood Chain / Pons / Uniswap context where accurate.

## Trading

Trading for Pump markets happens on Solana terminals. SCOOP links out to Axiom (primary) and GMGN (secondary); it does not custody Solana swaps. Pump.fun remains the launch venue, not the primary trade destination on scoop.fun.

---

# 24. Creator Rewards Power Stronger Markets

SCOOP’s native token earns creator rewards from its own market activity.

Those rewards are recycled back into the ecosystem. SCOOP uses AI to evaluate new launches for narrative strength, lore and early market signals, then selectively deploys those rewards through real onchain purchases into standout markets.

The objective is to create a reinforcing loop:

```text
strong narratives → better launches → more activity → creator rewards → strategic onchain support for new markets
```

This support is selective rather than guaranteed. SCOOP does not buy every launch, and creator-reward deployment is based on the system’s assessment of narrative quality and market conditions.

## Current dual-rail product

- **Solana → Pump.fun** — launch venue and Solana creator-fee accrual; claim via `/account`
- **Robinhood Chain → Pons** — current RHC execution rail
- AI-assisted news launches and cross-chain discovery on scoop.fun
- Creator rewards recycled into selective onchain purchases behind strong narratives

Historical SCOOP-native Robinhood protocol fee splits and factory launch mechanics are documented above and marked as historical; they are not the active dual-rail model.
