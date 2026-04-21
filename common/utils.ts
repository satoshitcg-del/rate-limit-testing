/**
 * Common Utilities
 * Shared helper functions
 */

/**
 * Simple logger with timestamps
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  log(message: string, ...args: any[]): void {
    console.log(`[${new Date().toISOString()}] [${this.context}] ${message}`, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(`INFO: ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[${new Date().toISOString()}] [${this.context}] ERROR: ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (process.env.DEBUG) {
      this.log(`DEBUG: ${message}`, ...args);
    }
  }
}

/**
 * Wait for specified milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for rate limit window to reset (61 seconds + buffer)
 */
export function waitForRateLimitReset(): Promise<void> {
  return wait(65000);
}

/**
 * Parse rate limit info from response headers
 */
export function parseRateLimitHeaders(headers: Record<string, string>): {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
} {
  const normalizeKey = (key: string) => key.toLowerCase().replace(/-/g, '_');

  const headerMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    headerMap[normalizeKey(key)] = value;
  }

  return {
    limit: headerMap['x_ratelimit_limit'] ? parseInt(headerMap['x_ratelimit_limit'], 10) : null,
    remaining: headerMap['x_ratelimit_remaining'] ? parseInt(headerMap['x_ratelimit_remaining'], 10) : null,
    reset: headerMap['x_ratelimit_reset'] ? parseInt(headerMap['x_ratelimit_reset'], 10) : null,
    retry_after: headerMap['retry_after'] ? parseInt(headerMap['retry_after'], 10) : null,
  };
}

/**
 * Calculate remaining time until rate limit reset
 */
export function getTimeUntilReset(resetTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, resetTimestamp - now);
}

/**
 * Format test data as table row
 */
export function formatAsTable(headers: string[], rows: string[][]): string {
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => r[i]?.length || 0))
  );

  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
  const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');
  const dataRows = rows.map(row =>
    row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Sleep utility for test steps
 */
export const sleep = wait;