import { describe, expect, it } from 'vitest';
import {
  HELLO_FIXTURE,
  ZERO_ADDRESS,
  DEAD_ADDRESS,
  classifyBuySell,
  classifyTransfer,
  foldHolderBalances,
} from '@scoop/shared';
import { scoopAbis } from '@scoop/contracts';
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type Hex,
  type Log,
  type TransactionReceipt,
} from 'viem';
import { decodeHelloLogs } from './decode.js';
import { evaluateHelloTradeInvariants, HELLO_LAUNCH_1M_BUCKET } from './verify.js';
import { HELLO } from './fixture.js';

describe('HELLO classification (network-independent)', () => {
  it('classifies initial buy swap deltas', () => {
    expect(
      classifyBuySell(-HELLO_FIXTURE.initialBuyQuote, HELLO_FIXTURE.initialBuyTokens),
    ).toBe('buy');
  });

  it('classifies HELLO transfer path', () => {
    expect(
      classifyTransfer({
        from: ZERO_ADDRESS,
        to: HELLO_FIXTURE.factory,
        amount: HELLO_FIXTURE.totalSupply,
        factory: HELLO_FIXTURE.factory,
        creator: HELLO_FIXTURE.creator,
        poolManager: HELLO_FIXTURE.poolManager,
        dead: DEAD_ADDRESS,
        zero: ZERO_ADDRESS,
      }),
    ).toBe('mint');
  });

  it('folds holders without retaining factory balance', () => {
    const supply = HELLO_FIXTURE.totalSupply;
    const dust = HELLO_FIXTURE.deadBalance;
    const buy = HELLO_FIXTURE.initialBuyTokens;
    const lp = supply - dust;
    const holders = foldHolderBalances([
      {
        from: ZERO_ADDRESS,
        to: HELLO_FIXTURE.factory,
        amount: supply,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: DEAD_ADDRESS,
        amount: dust,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.poolManager,
        amount: lp,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.poolManager,
        to: HELLO_FIXTURE.factory,
        amount: buy,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
      {
        from: HELLO_FIXTURE.factory,
        to: HELLO_FIXTURE.creator,
        amount: buy,
        blockNumber: HELLO_FIXTURE.blockNumber,
      },
    ]);
    expect(holders.find((h) => h.address === HELLO_FIXTURE.factory)).toBeUndefined();
    expect(holders.find((h) => h.address === HELLO_FIXTURE.creator)?.balanceRaw).toBe(buy);
  });
});

describe('HELLO decode (synthetic Transfer)', () => {
  it('decodes an ERC-20 Transfer log via ScoopToken ABI', () => {
    const event = parseAbiItem(
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    );
    const topics = encodeEventTopics({
      abi: [event],
      eventName: 'Transfer',
      args: {
        from: ZERO_ADDRESS,
        to: HELLO_FIXTURE.factory as Hex,
      },
    });
    const data = encodeAbiParameters([{ type: 'uint256' }], [HELLO_FIXTURE.totalSupply]);

    const log = {
      address: HELLO_FIXTURE.token as Hex,
      topics: topics as [Hex, ...Hex[]],
      data,
      logIndex: 0,
      transactionIndex: 0,
      transactionHash: HELLO_FIXTURE.txHash as Hex,
      blockHash: `0x${'ab'.repeat(32)}` as Hex,
      blockNumber: BigInt(HELLO_FIXTURE.blockNumber),
      removed: false,
    } satisfies Log;

    const receipt = {
      logs: [log],
      status: 'success',
      cumulativeGasUsed: 0n,
      gasUsed: 0n,
      effectiveGasPrice: 0n,
      blockHash: log.blockHash,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      transactionIndex: 0,
      from: HELLO_FIXTURE.creator as Hex,
      to: HELLO_FIXTURE.factory as Hex,
      contractAddress: null,
      logsBloom: '0x',
      type: 'eip1559',
    } as unknown as TransactionReceipt;

    const decoded = decodeHelloLogs(receipt);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.kind).toBe('Transfer');
    if (decoded[0]?.kind === 'Transfer') {
      expect(decoded[0].args.from).toBe(ZERO_ADDRESS);
      expect(decoded[0].args.to).toBe(HELLO_FIXTURE.factory);
      expect(decoded[0].args.value).toBe(HELLO_FIXTURE.totalSupply);
    }
    expect(scoopAbis.ScoopToken).toBeTruthy();
  });
});

const baseLaunch = {
  token_address: HELLO.token,
  initial_buy_quote_raw: HELLO.initialBuyQuote.toString(),
  pool_id: HELLO.poolId,
  creator_id: HELLO.creatorId,
};

const baseInitialBuy = {
  tx_hash: HELLO.txHash,
  is_initial_buy: true,
  side: 'buy',
  quote_amount_raw: HELLO.initialBuyQuote.toString(),
  token_amount_raw: HELLO.initialBuyTokens.toString(),
};

describe('HELLO verifier production-safety (immutable vs mutable)', () => {
  it('passes with only the canonical initial buy', () => {
    const checks = evaluateHelloTradeInvariants({
      launches: [baseLaunch],
      initialBuyTrades: [baseInitialBuy],
      totalTrades: 1,
      tokenName: HELLO.metadata.name,
      tokenSymbol: HELLO.metadata.symbol,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
    expect(HELLO_LAUNCH_1M_BUCKET).toBe(Math.floor(HELLO.blockTimestamp / 60) * 60);
  });

  it('passes with initial buy + later genuine trades', () => {
    const checks = evaluateHelloTradeInvariants({
      launches: [baseLaunch],
      initialBuyTrades: [baseInitialBuy],
      totalTrades: 3,
      tokenName: HELLO.metadata.name,
      tokenSymbol: HELLO.metadata.symbol,
    });
    expect(checks.every((c) => c.pass)).toBe(true);
    const total = checks.find((c) => c.name === 'total_trades_at_least_one');
    expect(total?.kind).toBe('mutable');
    expect(total?.pass).toBe(true);
  });

  it('fails with duplicate initial-buy trades', () => {
    const checks = evaluateHelloTradeInvariants({
      launches: [baseLaunch],
      initialBuyTrades: [baseInitialBuy, { ...baseInitialBuy }],
      totalTrades: 2,
    });
    const dup = checks.find((c) => c.name === 'exactly_one_initial_buy_trade');
    expect(dup?.pass).toBe(false);
    expect(dup?.kind).toBe('immutable');
  });

  it('fails if initial-buy amounts change', () => {
    const checks = evaluateHelloTradeInvariants({
      launches: [
        {
          ...baseLaunch,
          initial_buy_quote_raw: '1',
        },
      ],
      initialBuyTrades: [
        {
          ...baseInitialBuy,
          quote_amount_raw: '1',
          token_amount_raw: '1',
        },
      ],
      totalTrades: 1,
    });
    expect(checks.find((c) => c.name === 'initial_buy_quote')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'initial_buy_quote_amount')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'initial_buy_token_amount')?.pass).toBe(false);
  });

  it('fails if launch metadata / identity changes', () => {
    const checks = evaluateHelloTradeInvariants({
      launches: [
        {
          ...baseLaunch,
          token_address: '0x1111111111111111111111111111111111111111',
          pool_id: `0x${'c'.repeat(64)}`,
          creator_id: `0x${'d'.repeat(64)}`,
        },
      ],
      initialBuyTrades: [baseInitialBuy],
      totalTrades: 1,
      tokenName: 'Wrong',
      tokenSymbol: 'NOPE',
    });
    expect(checks.find((c) => c.name === 'token_address')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'pool_id')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'creator_id')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'token_name')?.pass).toBe(false);
    expect(checks.find((c) => c.name === 'token_symbol')?.pass).toBe(false);
  });
});
