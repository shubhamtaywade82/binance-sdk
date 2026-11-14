/**
 * Paginated historical kline fetch as an async generator.
 *
 * Pagination: each page is requested from `lastOpenTime + 1`, so no bar is
 * returned twice. Iteration ends when a page comes back short or empty, when the
 * next open time passes `endTime`, or when `maxPages` is reached.
 *
 * Protocol checks: a row without an integer open time (row[0]) throws, and so does
 * a non-increasing open time. Both indicate a corrupt or misordered response. The
 * page size is caller-supplied and is not assumed to be the exchange's maximum.
 * The per-request limit for each product is not verified, so no default is set.
 */

export type KlineRow = readonly unknown[];

export interface KlinePageParams {
  startTime: number;
  endTime?: number;
  limit: number;
}

export interface HistoricalKlineOptions {
  startTime: number;
  endTime?: number;
  pageSize: number;
  fetchPage: (params: KlinePageParams) => Promise<readonly KlineRow[]>;
  /** Stop after this many requests. Undefined means no page cap. */
  maxPages?: number;
  signal?: AbortSignal;
}

export async function* iterateHistoricalKlines(options: HistoricalKlineOptions): AsyncGenerator<KlineRow> {
  const { startTime, endTime, pageSize, fetchPage, maxPages, signal } = options;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize must be a positive integer, got ${pageSize}`);
  }
  if (!Number.isSafeInteger(startTime) || startTime < 0) {
    throw new RangeError(`startTime must be a non-negative integer ms, got ${startTime}`);
  }
  if (endTime !== undefined && (!Number.isSafeInteger(endTime) || endTime < startTime)) {
    throw new RangeError(`endTime must be an integer ms >= startTime, got ${endTime}`);
  }

  let cursor = startTime;
  let lastOpen = Number.NEGATIVE_INFINITY;
  let pages = 0;

  for (;;) {
    if (signal?.aborted) throw new Error('historical kline iteration aborted');
    if (maxPages !== undefined && pages >= maxPages) return;

    const rows = await fetchPage({ startTime: cursor, endTime, limit: pageSize });
    pages += 1;
    if (rows.length === 0) return;

    for (const row of rows) {
      const openTime = row[0];
      if (typeof openTime !== 'number' || !Number.isSafeInteger(openTime)) {
        throw new Error('kline row has no integer open time at index 0');
      }
      if (openTime <= lastOpen) {
        throw new Error(`kline open times are not strictly increasing (${openTime} after ${lastOpen})`);
      }
      if (endTime !== undefined && openTime > endTime) return;
      lastOpen = openTime;
      yield row;
    }

    if (rows.length < pageSize) return;
    cursor = lastOpen + 1;
  }
}
