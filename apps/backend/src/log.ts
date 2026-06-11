/** Minimal structured-ish console logging, per spec ("simple console.log for now"). */

export function log(message: string, meta?: Record<string, unknown>): void {
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.message}` : error !== undefined ? String(error) : '';
  console.error(`[${new Date().toISOString()}] ERROR ${message}${detail ? ` :: ${detail}` : ''}`);
}
