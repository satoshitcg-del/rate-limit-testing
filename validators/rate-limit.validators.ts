/**
 * Rate Limit Validators
 * Centralized assertions for rate limit testing
 */

import { expect } from '@playwright/test';

export interface RateLimitResponse {
  statusCode: number;
  body?: any;
  headers?: Record<string, string>;
}

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
}

/**
 * Validates rate limit response format
 */
export function validateRateLimitResponse(response: RateLimitResponse): void {
  expect(response.statusCode).toBe(429);
}

export function validateRateLimitBody(body: any): void {
  expect(body).toHaveProperty('success', false);
  expect(body).toHaveProperty('code', 10027);
  expect(body).toHaveProperty('message', 'too many requests');
}

/**
 * Validates rate limit headers exist
 */
export function validateRateLimitHeaders(headers: Record<string, string>): RateLimitInfo {
  const info: RateLimitInfo = {
    limit: null,
    remaining: null,
    reset: null,
    retryAfter: null,
  };

  // These headers may or may not exist depending on API implementation
  // This is informational, not a hard requirement
  if (headers['x-ratelimit-limit']) {
    info.limit = parseInt(headers['x-ratelimit-limit'], 10);
  }
  if (headers['x-ratelimit-remaining']) {
    info.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
  }
  if (headers['x-ratelimit-reset']) {
    info.reset = parseInt(headers['x-ratelimit-reset'], 10);
  }
  if (headers['retry-after']) {
    info.retryAfter = parseInt(headers['retry-after'], 10);
  }

  return info;
}

/**
 * Analyzes burst test results for rate limit behavior
 */
export function analyzeBurstResults(results: { statusCode: number }[]): {
  hasRateLimit: boolean;
  rateLimitAt: number | null;
  totalRequests: number;
  successCount: number;
  rateLimitedCount: number;
} {
  let rateLimitAt: number | null = null;

  for (let i = 0; i < results.length; i++) {
    if (results[i].statusCode === 429 && rateLimitAt === null) {
      rateLimitAt = i + 1;
    }
  }

  return {
    hasRateLimit: rateLimitAt !== null,
    rateLimitAt,
    totalRequests: results.length,
    successCount: results.filter(r => r.statusCode === 200).length,
    rateLimitedCount: results.filter(r => r.statusCode === 429).length,
  };
}

/**
 * Validates that an endpoint has rate limit protection
 */
export function validateHasRateLimit(
  results: { statusCode: number }[],
  expectedLimit: number
): { pass: boolean; message: string } {
  const analysis = analyzeBurstResults(results);

  if (!analysis.hasRateLimit) {
    return {
      pass: false,
      message: `Endpoint should have rate limit (${expectedLimit} req/min)`,
    };
  }

  // Rate limit should trigger at or before expected limit + buffer
  if (analysis.rateLimitAt! > expectedLimit + 5) {
    return {
      pass: false,
      message: `Rate limit triggered too late (at ${analysis.rateLimitAt}, expected ~${expectedLimit})`,
    };
  }

  return {
    pass: true,
    message: `Rate limit triggered correctly at request ${analysis.rateLimitAt}`,
  };
}

/**
 * Validates user isolation (users should have separate counters)
 */
export function validateUserIsolation(
  userAResults: { statusCode: number }[],
  userBResults: { statusCode: number }[]
): { pass: boolean; message: string } {
  const aAnalysis = analyzeBurstResults(userAResults);
  const bAnalysis = analyzeBurstResults(userBResults);

  // If user A is rate limited, user B should still have some successes
  if (aAnalysis.hasRateLimit && bAnalysis.successCount === 0) {
    return {
      pass: false,
      message: 'User B should NOT be blocked when User A is rate limited',
    };
  }

  return {
    pass: true,
    message: 'User isolation working correctly',
  };
}