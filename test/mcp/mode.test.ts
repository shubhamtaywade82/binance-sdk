import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { PolicyViolationError } from '../../src/errors/index.js';
import { mcpClientFromEnv, mcpModeBanner, resolveMcpMode } from '../../src/mcp/mode.js';

describe('MCP CLI mode resolution (fail-closed defaults)', () => {
  it('defaults to paper execution with a read-only fence — no env, no live trading', () => {
    const mode = resolveMcpMode({});
    expect(mode.backend).toBe('paper');
    expect(mode.readOnly).toBe(true);
  });

  it('BINANCE_MCP_LIVE=1 opts into live execution and lifts the read-only fence', () => {
    const mode = resolveMcpMode({ BINANCE_MCP_LIVE: '1' });
    expect(mode.backend).toBe('live');
    expect(mode.readOnly).toBe(false);
  });

  it('the default client refuses every mutating request by policy (trading tools dead)', () => {
    const client: BinanceClient = mcpClientFromEnv({ BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's' });
    expect(client.policy).toBeDefined();
    expect(() =>
      client.policy!.check('POST', '/fapi/v1/order', { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: 1 }),
    ).toThrow(PolicyViolationError);
    // Reads still flow — account tools keep working.
    expect(() => client.policy!.check('GET', '/fapi/v2/account', {})).not.toThrow();
  });

  it('the live-opted-in client has no read-only fence', () => {
    const client: BinanceClient = mcpClientFromEnv({
      BINANCE_MCP_LIVE: '1', BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's',
    });
    expect(client.policy).toBeUndefined();
  });

  it('the banner names the effective backend and the opt-in flag', () => {
    const paper = mcpModeBanner(resolveMcpMode({}), {});
    expect(paper.some((l) => l.includes('backend=PAPER'))).toBe(true);
    expect(paper.some((l) => l.includes('BINANCE_MCP_LIVE=1'))).toBe(true);
    expect(paper.some((l) => l.includes('read-only fence=ON'))).toBe(true);

    const live = mcpModeBanner(resolveMcpMode({ BINANCE_MCP_LIVE: '1' }), {});
    expect(live.some((l) => l.includes('backend=LIVE'))).toBe(true);
    expect(live.some((l) => l.includes('read-only fence=OFF'))).toBe(true);
  });
});
