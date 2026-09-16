import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts'],
      thresholds: {
        // Lines, statements and branches clear 80/80/70 across the v3
        // platform surfaces (foundation, ws, execution, state, paper,
        // mcp) and the v3 product clients. Functions sit at ~71% because
        // the v2 HTTP-wrapping resources (SpotTrading / Margin /
        // SubAccount / CoinM*) and the v2 tool wrappers (account.tools,
        // paper.tools, market-data.tools, trading.tools, spot.tools,
        // ws.tools) are integration-shaped — every method is a 3-line
        // axios call whose real assertion surface is the smoke / testnet
        // scripts (scripts/smoke-test.ts, scripts/testnet-smoke.ts), not
        // unit tests. Lifting functions to 80 is tracked as a 3.0.1
        // follow-up (each file needs a focused MSW harness for every
        // method, which is genuinely a separate piece of work).
        lines: 80,
        statements: 80,
        functions: 70,
        branches: 70,
      },
    },
  },
});
