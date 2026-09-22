import { describe, expect, it } from 'vitest';
import {
  axiomTradeUrl,
  gmgnTradeUrl,
  pumpFunCoinUrl,
  solanaExplorerAddressUrl,
  solanaExplorerTxUrl,
} from '@/lib/solana/explorer';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';

describe('solana explorer helpers', () => {
  it('builds explorer and Pump.fun URLs from mint/signature', () => {
    expect(solanaExplorerAddressUrl(MINT)).toBe(
      `https://explorer.solana.com/address/${MINT}?cluster=mainnet`,
    );
    expect(solanaExplorerTxUrl('sig123')).toBe(
      'https://explorer.solana.com/tx/sig123?cluster=mainnet',
    );
    expect(pumpFunCoinUrl(MINT)).toBe(`https://pump.fun/coin/${MINT}`);
  });

  it('builds Axiom and GMGN terminal URLs from the exact mint', () => {
    expect(axiomTradeUrl(MINT)).toBe(`https://axiom.trade/t/${MINT}`);
    expect(gmgnTradeUrl(MINT)).toBe(`https://gmgn.ai/sol/token/${MINT}`);
    expect(axiomTradeUrl(`  ${MINT}  `)).toContain(MINT);
    expect(gmgnTradeUrl(`  ${MINT}  `)).toContain(MINT);
  });
});
