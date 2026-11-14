import type { WsApiResponse } from '../../types/userdata.types.js';

/** Minimal RPC surface. WsApiClient and RotatingWsApiClient both satisfy it. */
export interface WsRpcClient {
  request(
    method: string,
    params?: Record<string, unknown>,
    options?: { signed?: boolean },
  ): Promise<WsApiResponse>;
}

/**
 * Subscribe to the user-data stream over an authenticated WS API connection. Verified:
 * `userDataStream.subscribe` requires a session authenticated with Ed25519 (session.logon),
 * takes an optional `filter`, and returns `result.subscriptionId`. The request is unsigned,
 * because the session carries authorization. Use this as the RotatingWsApiClient resubscribe
 * hook so the subscription is re-established after rotation or eventStreamTerminated.
 */
export async function subscribeUserDataStream(
  client: WsRpcClient,
  options: { filter?: unknown } = {},
): Promise<number> {
  const params: Record<string, unknown> = options.filter !== undefined ? { filter: options.filter } : {};
  const response = await client.request('userDataStream.subscribe', params, { signed: false });
  const result = response.result as { subscriptionId?: unknown } | undefined;
  if (typeof result?.subscriptionId !== 'number') {
    throw new Error('userDataStream.subscribe returned no subscriptionId');
  }
  return result.subscriptionId;
}

/** Close one subscription by id, or every subscription when no id is given (verified). */
export async function unsubscribeUserDataStream(client: WsRpcClient, subscriptionId?: number): Promise<void> {
  const params: Record<string, unknown> = subscriptionId !== undefined ? { subscriptionId } : {};
  await client.request('userDataStream.unsubscribe', params, { signed: false });
}
