/**
 * Structured logging for SDK internals.
 *
 * The SDK is increasingly used as the execution boundary under autonomous
 * agents, so its internals need observable, machine-parseable telemetry
 * instead of scattered console.log calls. Log records are single-line JSON:
 *
 *   {"ts":"2026-09-08T03:00:00.000Z","level":"info","component":"ws","event":"reconnect","data":{...}}
 *
 * The default logger is silent — opting in never changes behavior, only
 * visibility. Inject via `new BinanceClient({ logger: createConsoleLogger('debug') })`.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

export interface SdkLogger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, data?: Record<string, unknown>): void;
  /** A logger scoped to a component name (component field becomes "parent.child"). */
  child(component: string): SdkLogger;
}

export interface ConsoleLoggerOptions {
  /** Destination stream. Defaults to console (stdout for <= info, stderr for warn/error). */
  write?: (line: string) => void;
  /** Extra fields merged into every record, e.g. { service: 'crypto-agent' }. */
  base?: Record<string, unknown>;
}

function record(
  level: Exclude<LogLevel, 'silent'>,
  component: string,
  event: string,
  data?: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    component,
    event,
  };
  if (data !== undefined && Object.keys(data).length > 0) payload.data = data;
  return payload;
}

/** JSON-lines logger writing to the console (or a custom `write` sink). */
export function createConsoleLogger(level: LogLevel = 'info', options: ConsoleLoggerOptions = {}): SdkLogger {
  const write = options.write ?? ((line: string) => console.log(line));
  const base = options.base;
  const enabled = (candidate: Exclude<LogLevel, 'silent'>) => LEVEL_WEIGHT[candidate] >= LEVEL_WEIGHT[level];

  const emit = (candidate: Exclude<LogLevel, 'silent'>, component: string, event: string, data?: Record<string, unknown>) => {
    if (!enabled(candidate)) return;
    const payload = record(candidate, component, event, data);
    const merged = base ? { ...base, ...payload } : payload;
    write(JSON.stringify(merged));
  };

  const make = (component: string): SdkLogger => ({
    debug: (event, data) => emit('debug', component, event, data),
    info: (event, data) => emit('info', component, event, data),
    warn: (event, data) => emit('warn', component, event, data),
    error: (event, data) => emit('error', component, event, data),
    child: (sub) => make(sub.includes('.') ? `${component}.${sub}` : `${component}.${sub}`),
  });

  return make('sdk');
}

/** Drop-all logger — the SDK default. */
export const silentLogger: SdkLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

/** In-memory logger for tests: records every line for assertions. */
export function createTestLogger(): SdkLogger & { lines: string[]; records: Record<string, unknown>[] } {
  const lines: string[] = [];
  const records: Record<string, unknown>[] = [];
  const sink = createConsoleLogger('debug', {
    write: (line) => {
      lines.push(line);
      records.push(JSON.parse(line));
    },
  });
  return Object.assign(sink, { lines, records });
}
