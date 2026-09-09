import { z } from 'zod';
import type { BinanceClient } from '../client/BinanceClient.js';
import type { ExecutionGateway } from '../execution/Gateway.js';
import type { ExecutionBackend } from '../execution/Gateway.js';
import { orderParamsSchema } from './trading.tools.js';
import type { ToolDefinition } from './types.js';
import { textResult, normalizeSymbol } from './types.js';

/**
 * Agent-native execution surface: the toolkit's order tools routed through
 * the {@link ExecutionGateway} instead of the raw REST layer.
 *
 * What MCP/agent callers gain over `futures_new_order`:
 *
 *  - **backend routing** — every tool takes `backend: 'live' | 'paper'`, so a
 *    single toolkit serves test automation (paper) and real trading (live)
 *    without any code change; the gateway's `defaultBackend` decides what an
 *    unspecified call does;
 *  - **idempotency** — `intentId` makes retries safe: a duplicate submission
 *    of the same intent returns the original execution instead of a second
 *    order (the exchange-matching double-spend footgun);
 *  - **reconciliation** — timeouts and connection resets are recovered by
 *    REST lookup, never guessed at;
 *  - **identical envelopes** — paper and live return the same `Execution`
 *    shape with exact decimal strings, so downstream parsing is uniform.
 */

const backend = z
  .enum(['live', 'paper'])
  .optional()
  .describe("Execution backend for this call; default is the gateway's default backend");

const intentId = z
  .string()
  .min(1)
  .optional()
  .describe(
    'Idempotency key. Re-submitting the same intentId returns the original execution instead of placing a second order. Recommended for any retry loop.',
  );

export function executionTools(gateway: ExecutionGateway, client?: BinanceClient): ToolDefinition[] {
  return [
    {
      name: 'execution_place_order',
      description:
        'Place an order through the execution gateway: idempotent (retry with the same intentId returns the original execution), reconciled on ambiguous failures, and routable to the live exchange or the paper simulator via `backend`. Paper orders need no API keys. MARKET and LIMIT types supported on paper.',
      inputSchema: orderParamsSchema.extend({ intentId, backend }),
      handler: async (args) => {
        const { intentId: intent, backend: route } = args;
        return textResult(
          await gateway.placeOrder(
            { ...args, intentId: intent, symbol: normalizeSymbol(args.symbol) },
            { backend: route },
          ),
        );
      },
    },
    {
      name: 'execution_cancel_order',
      description:
        'Cancel an order idempotently by exchange orderId, clientOrderId, or the intentId from execution_place_order. Cancels of already-gone orders resolve to a terminal CANCELED execution (never a thrown -2011).',
      inputSchema: z.object({
        symbol: z.string().min(1).describe('USD-M pair, e.g. BTCUSDT'),
        orderId: z.number().int().positive().optional().describe('Exchange order id'),
        origClientOrderId: z.string().optional().describe('Client order id (the reconciliation key)'),
        intentId,
        backend,
      }),
      handler: async ({ symbol, orderId, origClientOrderId, intentId: intent, backend: route }) =>
        textResult(
          await gateway.cancelOrder(
            normalizeSymbol(symbol),
            { orderId, origClientOrderId, intentId: intent, backend: route },
          ),
        ),
    },
    {
      name: 'execution_get_order',
      description:
        'Fetch an execution from the ledger by its intentId. When `backend` is omitted both ledgers are searched (paper first), so callers do not need to remember where an intent ran.',
      inputSchema: z.object({ intentId: z.string().min(1), backend }),
      handler: async ({ intentId: intent, backend: route }) => {
        const execution = route
          ? gateway.getExecution(intent, route)
          : gateway.getExecution(intent, 'paper') ?? gateway.getExecution(intent, 'live');
        if (!execution) throw new Error(`No execution for intentId ${intent}`);
        return textResult(execution);
      },
    },
    {
      name: 'execution_list_orders',
      description:
        'List the execution ledger (most recent first) for a backend. Each entry carries status, fills, and reconciliation state. Paper and live ledgers are independent.',
      inputSchema: z.object({ backend }),
      handler: async ({ backend: route }) => textResult(gateway.listExecutions(route)),
    },
    {
      name: 'execution_reconcile_order',
      description:
        'Force a reconciliation pass for an intent whose outcome is unknown (e.g. after a timeout). Recovers the true state from the exchange (live) or simulator (paper) instead of guessing.',
      inputSchema: z.object({ intentId: z.string().min(1), backend }),
      handler: async ({ intentId: intent, backend: route }) =>
        textResult(await gateway.reconcile(intent, route)),
    },
    {
      name: 'execution_status',
      description:
        'Snapshot of the execution environment: default backend, risk-gateway state (when a trading policy is configured), and the paper simulator account (balance, positions, unrealized PnL). Read-only, never places orders.',
      inputSchema: z.object({}),
      handler: async () => {
        const risk = client?.getRiskStatus?.();
        const paper = gateway.paperEngine.getAccountInfo();
        return textResult({
          defaultBackend: gateway.backend,
          risk: risk ?? null,
          paper: {
            balance: paper.balance,
            availableBalance: paper.availableBalance,
            totalWalletBalance: paper.totalWalletBalance,
            unrealizedPnl: paper.unrealizedPnl,
            realizedPnl: paper.realizedPnl,
            positions: Object.values(paper.positions).filter((p) => p.quantity > 0),
            orderCount: paper.orders.length,
          },
        });
      },
    },
  ];
}
