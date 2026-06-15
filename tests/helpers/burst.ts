/**
 * Burst testing + result analysis.
 *
 * - burstTest()              fire N rapid requests at one endpoint, stop on first 429
 * - analyzeRateLimitResults() summarize a burst (was it limited, at which request, headers)
 * - ipBlocked()              detect admin block (400 with no 429) so callers skip, not false-fail
 */

import { request, APIResponse, APIRequestContext } from '@playwright/test';
import { getApiBaseUrl, getWebUrl } from '../../config/env';

export interface RateLimitResult {
  endpoint: string;
  statusCode: number;
  rateLimit: {
    limit: number | null;
    remaining: number | null;
    reset: number | null;
    retryAfter: number | null;
  };
  isRateLimited: boolean;
  requestCount: number;
  rateLimitCode?: number;
  rateLimitMessage?: string;
  isUnauthorized?: boolean; // true when statusCode is 401
}

export interface BurstTestConfig {
  baseURL?: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  burstSize?: number;
  body?: object;
  requestContext?: APIRequestContext;
  uploadFile?: { path: string; fieldName: string; mimeType?: string };
  refreshToken?: () => Promise<string | undefined>; // Optional: callback to get fresh token on 401
}

function extractRateLimitInfo(response: APIResponse) {
  const headers = response.headers();
  return {
    limit: headers['x-ratelimit-limit'] ? parseInt(headers['x-ratelimit-limit']) : null,
    remaining: headers['x-ratelimit-remaining'] ? parseInt(headers['x-ratelimit-remaining']) : null,
    reset: headers['x-ratelimit-reset'] ? parseInt(headers['x-ratelimit-reset']) : null,
    retryAfter: headers['retry-after'] ? parseInt(headers['retry-after']) : null,
  };
}

function methodToFunction(ctx: APIRequestContext, method: string) {
  switch (method.toUpperCase()) {
    case 'GET': return ctx.get.bind(ctx);
    case 'POST': return ctx.post.bind(ctx);
    case 'PUT': return ctx.put.bind(ctx);
    case 'PATCH': return ctx.patch.bind(ctx);
    case 'DELETE': return ctx.delete.bind(ctx);
    default: throw new Error(`Unsupported method: ${method}`);
  }
}

function getDefaultHeaders(token?: string): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    'Origin': getWebUrl(),
    'Referer': getWebUrl() + '/',
    'Accept': 'application/json',
  };
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;
  return baseHeaders;
}

export async function burstTest(config: BurstTestConfig): Promise<RateLimitResult[]> {
  const baseURL = config.baseURL || getApiBaseUrl();
  const { endpoint, method, token, burstSize = 100, body, requestContext, uploadFile, refreshToken } = config;
  const results: RateLimitResult[] = [];

  const ctx = requestContext || await request.newContext();
  const doRequest = methodToFunction(ctx, method);

  for (let i = 1; i <= burstSize; i++) {
    const headers = getDefaultHeaders(token);

    let statusCode = 0;
    let responseBody: any = null;
    let rateLimitCode: number | undefined;
    let rateLimitMessage: string | undefined;

    try {
      let response: APIResponse;

      if (uploadFile) {
        const { path, fieldName, mimeType } = uploadFile;
        const fs = require('fs');
        response = await doRequest(`${baseURL}${endpoint}`, {
          multipart: {
            [fieldName]: {
              name: path.split(/[\\/]/).pop() || 'file',
              mimeType: mimeType || 'image/jpeg',
              buffer: fs.readFileSync(path),
            },
          },
          headers,
        });
      } else {
        headers['Content-Type'] = 'application/json';
        response = await doRequest(`${baseURL}${endpoint}`, {
          ...(body && { data: body }),
          headers,
        });
      }

      statusCode = response.status();
      const rlHeaders = extractRateLimitInfo(response);

      if (response.status() === 429) {
        try {
          responseBody = await response.json();
          rateLimitCode = responseBody?.code;
          rateLimitMessage = responseBody?.message;
        } catch {}
      }

      const result: RateLimitResult = {
        endpoint,
        statusCode,
        rateLimit: rlHeaders,
        isRateLimited: response.status() === 429,
        requestCount: i,
        rateLimitCode,
        rateLimitMessage,
        isUnauthorized: response.status() === 401,
      };

      console.log(`[burstTest] Request ${i}: status=${statusCode}, isRateLimited=${result.isRateLimited}`);
      results.push(result);

      if (response.status() === 429) {
        break;
      }

      // If 401 and refreshToken callback provided, get new token and retry
      if (response.status() === 401 && refreshToken) {
        console.log(`[burstTest] Got 401, refreshing token...`);
        const newToken = await refreshToken();
        if (newToken) {
          // Update headers with new token
          headers['Authorization'] = `Bearer ${newToken}`;
          // Retry this request
          continue;
        }
      }
    } catch (e: any) {
      console.log(`[burstTest] Request ${i}: ERROR - ${e.message}`);
      results.push({
        endpoint,
        statusCode: 0,
        rateLimit: { limit: null, remaining: null, reset: null, retryAfter: null },
        isRateLimited: false,
        requestCount: i,
      });
    }
  }

  return results;
}

export function analyzeRateLimitResults(results: RateLimitResult[]): {
  totalRequests: number;
  rateLimited: boolean;
  rateLimitedAt?: number;
  retryAfterValue?: number;
  limitHeader?: number;
  remainingSequence: (number | null)[];
  rateLimitCode?: number;
  rateLimitMessage?: string;
} {
  const rateLimitedResults = results.filter(r => r.isRateLimited);

  return {
    totalRequests: results.length,
    rateLimited: rateLimitedResults.length > 0,
    rateLimitedAt: rateLimitedResults[0]?.requestCount,
    retryAfterValue: rateLimitedResults[0]?.rateLimit.retryAfter ?? undefined,
    limitHeader: results[0]?.rateLimit.limit ?? undefined,
    remainingSequence: results.map(r => r.rateLimit.remaining),
    rateLimitCode: rateLimitedResults[0]?.rateLimitCode,
    rateLimitMessage: rateLimitedResults[0]?.rateLimitMessage,
  };
}

/**
 * IP/admin block detector. When sign-in (strict tier) is blocked by admin code 10019,
 * responses are 400 with no 429 — rate-limit behavior can't be exercised, so callers skip.
 */
export function ipBlocked(results: { statusCode: number }[]): boolean {
  const codes = results.map((r) => r.statusCode);
  return codes.some((s) => s === 400) && !codes.some((s) => s === 429);
}
