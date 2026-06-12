/**
 * Structured console logger used across the backend.
 * Format: [TIMESTAMP] [LEVEL] [MODULE] message {json meta}
 * e.g.    [2026-06-11 18:23:00] [INFO] [cron/finalizer] Finalized tournament #7
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  /** `error` may be anything thrown; its message is appended after `::`. */
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

/** UTC, second precision: "2026-06-11 18:23:00". */
function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function formatLine(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): string {
  // JSON.stringify can't serialize bigint (common in chain meta) — stringify those.
  const suffix = meta
    ? ` ${JSON.stringify(meta, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}`
    : '';
  return `[${timestamp()}] [${level}] [${module}] ${message}${suffix}`;
}

export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createLogger(module: string): Logger {
  return {
    info(message, meta) {
      console.log(formatLine('INFO', module, message, meta));
    },
    warn(message, meta) {
      console.warn(formatLine('WARN', module, message, meta));
    },
    error(message, error, meta) {
      const detail = error !== undefined ? ` :: ${errorDetail(error)}` : '';
      console.error(`${formatLine('ERROR', module, message, meta)}${detail}`);
    },
  };
}
