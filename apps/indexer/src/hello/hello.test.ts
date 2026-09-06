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
