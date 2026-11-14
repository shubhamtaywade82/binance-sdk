/**
 * Latency observability for user-data events. The two metrics are defined from
 * fields only, with no claim about where the delay sits:
 *
 * - receiveLagMs     = receivedAtMs − E     (E = event time). Includes transport,
 *                                            and clock skew between the exchange
 *                                            and this host.
 * - eventMinusTxMs   = E − T                (T = transaction time, when present).
 *
 * A negative receiveLag means the local clock is behind the exchange, so it is
 * counted separately as a skew indicator, not as a latency.
 */

export interface LatencySample {
  /** E: exchange event time (epoch ms). */
  eventTimeMs: number;
  /** T: transaction time (epoch ms), when the frame carries one. */
  transactionTimeMs?: number;
  /** Local epoch ms when the frame was received. */
  receivedAtMs: number;
}

export interface LatencyStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  /** Nearest-rank 95th percentile over the window. */
  p95: number;
}

export type LatencyMetric = 'receiveLag' | 'eventMinusTransaction';

export class ExecutionLatencyMonitor {
  private readonly windowSize: number;
  private readonly receiveLag: number[] = [];
  private readonly eventMinusTx: number[] = [];
  private negativeReceiveLagCount = 0;

  constructor(windowSize = 500) {
    if (!Number.isSafeInteger(windowSize) || windowSize < 1) {
      throw new RangeError(`windowSize must be a positive integer, got ${windowSize}`);
    }
    this.windowSize = windowSize;
  }

  record(sample: LatencySample): { receiveLagMs: number; eventMinusTransactionMs?: number } {
    const { eventTimeMs, transactionTimeMs, receivedAtMs } = sample;
    if (![eventTimeMs, receivedAtMs].every(Number.isFinite)) {
      throw new RangeError('latency sample requires finite eventTimeMs and receivedAtMs');
    }
    const receiveLagMs = receivedAtMs - eventTimeMs;
    if (receiveLagMs < 0) this.negativeReceiveLagCount += 1;
    push(this.receiveLag, receiveLagMs, this.windowSize);

    let eventMinusTransactionMs: number | undefined;
    if (transactionTimeMs !== undefined && Number.isFinite(transactionTimeMs)) {
      eventMinusTransactionMs = eventTimeMs - transactionTimeMs;
      push(this.eventMinusTx, eventMinusTransactionMs, this.windowSize);
    }
    return { receiveLagMs, eventMinusTransactionMs };
  }

  /** Samples where the local clock is behind the exchange. A non-zero count points to skew. */
  get clockSkewSamples(): number {
    return this.negativeReceiveLagCount;
  }

  stats(metric: LatencyMetric): LatencyStats | undefined {
    const values = metric === 'receiveLag' ? this.receiveLag : this.eventMinusTx;
    if (values.length === 0) return undefined;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const rank = Math.max(1, Math.ceil(0.95 * sorted.length));
    return {
      count: sorted.length,
      min: sorted[0] as number,
      max: sorted[sorted.length - 1] as number,
      mean: sum / sorted.length,
      p95: sorted[rank - 1] as number,
    };
  }
}

function push(buffer: number[], value: number, cap: number): void {
  buffer.push(value);
  if (buffer.length > cap) buffer.shift();
}
