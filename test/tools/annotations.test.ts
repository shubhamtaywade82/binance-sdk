import { describe, expect, it } from 'vitest';
import { BinanceClient } from '../../src/client/BinanceClient.js';
import { createFuturesToolkit, classifyToolAnnotations } from '../../src/tools/index.js';

function client(): BinanceClient {
  return new BinanceClient({ apiKey: 'k', apiSecret: 's' });
}

describe('tool annotations (MCP ToolAnnotations)', () => {
  it('every tool in the live toolkit gets an annotation object', () => {
    const tk = createFuturesToolkit(client());
    for (const tool of tk.tools) {
      expect(tool.annotations, `${tool.name} has no annotations`).toBeDefined();
    }
  });

  it('every live tool name has an explicit classification, not the cautious fallback', () => {
    // The fallback exists for a tool added without updating annotations.ts — it
    // should never actually fire for the tools that ship today. Reaching for
    // TOOL_ANNOTATIONS's exact set isn't exported (deliberately — it's an
    // implementation detail), so this proves the same thing indirectly: the
    // module's own file-header claim that annotations.ts is exhaustive.
    const tk = createFuturesToolkit(client());
    // A handful of tools from each category/risk tier that would land on the
    // WRITE_DESTRUCTIVE fallback if their name were ever typo'd out of the
    // explicit table -- picking distinctive ones catches drift cheaply.
    const sample = [
      'futures_ping',
      'futures_test_order',
      'spot_test_order',
      'execution_place_order',
      'execution_reconcile_order',
      'paper_open_position',
      'futures_ws_subscribe',
    ];
    const names = new Set(tk.tools.map((t) => t.name));
    for (const name of sample) expect(names.has(name), `${name} missing from live toolkit`).toBe(true);
  });

  it('futures_test_order / spot_test_order are read-only despite being POST order-validation calls', () => {
    expect(classifyToolAnnotations('futures_test_order')).toMatchObject({ readOnlyHint: true });
    expect(classifyToolAnnotations('spot_test_order')).toMatchObject({ readOnlyHint: true });
    // Their real-order siblings are not.
    expect(classifyToolAnnotations('futures_new_order')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(classifyToolAnnotations('spot_new_order')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('execution_place_order/cancel_order are idempotent; their raw-REST siblings are not', () => {
    expect(classifyToolAnnotations('execution_place_order')).toMatchObject({ idempotentHint: true, destructiveHint: true });
    expect(classifyToolAnnotations('execution_cancel_order')).toMatchObject({ idempotentHint: true, destructiveHint: true });
    expect(classifyToolAnnotations('futures_new_order')).toMatchObject({ idempotentHint: false });
    expect(classifyToolAnnotations('futures_cancel_order')).toMatchObject({ idempotentHint: false });
  });

  it('execution_reconcile_order and execution_status are read-only despite living in the execution file', () => {
    expect(classifyToolAnnotations('execution_reconcile_order')).toMatchObject({ readOnlyHint: true });
    expect(classifyToolAnnotations('execution_status')).toMatchObject({ readOnlyHint: true });
  });

  it('every paper_* tool is openWorldHint: false (local simulator, never the real exchange)', () => {
    const tk = createFuturesToolkit(client());
    const paperTools = tk.paper;
    expect(paperTools.length).toBeGreaterThan(0);
    for (const tool of paperTools) {
      expect(tool.annotations?.openWorldHint, `${tool.name} should be openWorldHint: false`).toBe(false);
    }
  });

  it('mutating account-config toggles with a cooldown are destructive but converge (idempotent)', () => {
    for (const name of ['futures_set_multi_assets_mode', 'futures_set_fee_burn', 'futures_set_position_mode']) {
      expect(classifyToolAnnotations(name)).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      });
    }
  });

  it('"cancel all" style tools converge to the same end state on repeat calls', () => {
    for (const name of ['futures_cancel_all_orders', 'futures_cancel_all_algo_orders', 'spot_cancel_open_orders']) {
      expect(classifyToolAnnotations(name)).toMatchObject({ destructiveHint: true, idempotentHint: true });
    }
  });

  it('an unrecognized tool name falls back to the most cautious classification, not the most permissive', () => {
    expect(classifyToolAnnotations('some_future_tool_nobody_classified_yet')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    // ...except under the paper_ prefix, which is never real-money-risk by construction.
    expect(classifyToolAnnotations('paper_some_future_tool')).toMatchObject({ openWorldHint: false });
  });
});
