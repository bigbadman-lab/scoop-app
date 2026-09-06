/**
 * Read-only fast-catchup RPC bench (no DB writes, no advisory lock).
 * Run: cd apps/indexer && npx tsx --env-file=../../.env.local scripts/bench-fast-catchup-readonly.ts
 */
import { createPublicClient, http, type Hex } from 'viem';
import pg from 'pg';

// Frozen canary addresses from packages/contracts manifests (no package import needed).
const FACTORY = '0x15E874Bc667435ddbF2a67c0362701DC23C90833' as Hex;
const CREATOR_REWARDS = '0x1248070FC454757B91337e66df883F90b7a06fA4' as Hex;
// PoolManager intentionally omitted from range getLogs (chain-wide noise).


function isRangeErr(e: unknown): boolean {
  const m = String(e instanceof Error ? e.message : e).toLowerCase();
  return (
    m.includes('block range') ||
    m.includes('too many') ||
    m.includes('response size') ||
    m.includes('size limit') ||
    m.includes('exceeded the size limit') ||
    m.includes('limit exceeded') ||
    m.includes('-32005') ||
    m.includes('-32602') ||
    m.includes('query returned more than')
  );
}

async function getLogsReduced(
  client: ReturnType<typeof createPublicClient>,
  from: bigint,
  to: bigint,
  address: Hex[],
  initial: number,
) {
  let cursor = from;
  let window = Math.max(1, initial);
  let calls = 0;
  let reductions = 0;
  const logs: { blockNumber: bigint | null }[] = [];
  while (cursor <= to) {
    const end =
      cursor + BigInt(window) - 1n > to ? to : cursor + BigInt(window) - 1n;
    try {
      calls += 1;
      const chunk = await client.getLogs({
        fromBlock: cursor,
        toBlock: end,
        address,
      });
      logs.push(...chunk);
      cursor = end + 1n;
    } catch (e) {
      if (!isRangeErr(e) || window <= 1) throw e;
      reductions += 1;
      const next = Math.max(1, Math.floor(window / 2));
      console.log(
        JSON.stringify({
          level: 'warn',
          message: 'getLogs range reduced',
          from: window,
          to: next,
          err: String(e instanceof Error ? e.message : e).slice(0, 140),
        }),
      );
      window = next;
    }
  }
  return { logs, calls, reductions, window };
}

async function main() {
  const rpc = process.env.ROBINHOOD_RPC_URL;
  const dbUrl = process.env.DATABASE_URL;
  if (!rpc || !dbUrl) throw new Error('ROBINHOOD_RPC_URL and DATABASE_URL required');

  const client = createPublicClient({ transport: http(rpc) });
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2 });

  const cp = await pool.query<{ last_block_number: string }>(
    `SELECT last_block_number FROM indexer_checkpoints WHERE chain_id=4663 AND stream_name='main'`,
  );
  const checkpoint = BigInt(cp.rows[0]!.last_block_number);
  const from = checkpoint + 1n;
  const to = from + 9999n;

  const tokens = await pool.query<{
    token_address: string;
    fee_distributor_address: string;
  }>(
    `SELECT token_address, fee_distributor_address FROM launches WHERE chain_id=4663`,
  );

  const addresses = [
    FACTORY,
    CREATOR_REWARDS,
    ...tokens.rows.map((r) => r.token_address as Hex),
    ...tokens.rows.map((r) => r.fee_distributor_address as Hex),
  ];
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))] as Hex[];

  const tipBefore = await client.getBlockNumber();
  const t0 = Date.now();
  const result = await getLogsReduced(client, from, to, unique, 2000);
  const elapsedMs = Date.now() - t0;
  const tipAfter = await client.getBlockNumber();

  const interesting = new Set(
    result.logs
      .filter((l) => l.blockNumber != null)
      .map((l) => l.blockNumber!.toString()),
  );
  const blocks = 10_000;
  const blocksPerSec = blocks / (elapsedMs / 1000);
  const chainDelta = Number(tipAfter - tipBefore);
  const chainBlocksPerSec = elapsedMs > 0 ? chainDelta / (elapsedMs / 1000) : 0;
  const anchorsIfEmpty = Math.ceil(blocks / 64) + 1;

  console.log(
    JSON.stringify(
      {
        message: 'fast catchup RPC bench (read-only, no writes)',
        checkpointBefore: checkpoint.toString(),
        rangeFrom: from.toString(),
        rangeTo: to.toString(),
        blocksSpanned: blocks,
        tipBefore: tipBefore.toString(),
        tipAfter: tipAfter.toString(),
        lagBefore: (tipBefore - checkpoint).toString(),
        elapsedMs,
        blocksPerSec: Number(blocksPerSec.toFixed(2)),
        getLogsCalls: result.calls,
        rangeReductions: result.reductions,
        finalWindow: result.window,
        logCount: result.logs.length,
        interestingBlocks: interesting.size,
        addressFilterCount: unique.length,
        estimatedAnchorGetBlocksIfEmpty: anchorsIfEmpty,
        chainBlocksProducedDuringBench: chainDelta,
        observedChainBlocksPerSec: Number(chainBlocksPerSec.toFixed(3)),
        wouldOutrunObservedChain: blocksPerSec > Math.max(chainBlocksPerSec, 0.5),
        note: 'No DB writes; Render worker holds advisory lock. Measures eth_getLogs throughput for fast path.',
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: String(e instanceof Error ? e.message : e),
    }),
  );
  process.exitCode = 1;
});
