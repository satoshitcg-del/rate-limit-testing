/**
 * Rate Limit Analyzer
 * Test helper for burst testing and rate limit analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { request, APIResponse, APIRequestContext } from '@playwright/test';
import { getApiBaseUrl, getWebUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const { endpoint, method, token, burstSize = 100, body, requestContext, uploadFile } = config;
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
      };

      console.log(`[burstTest] Request ${i}: status=${statusCode}, isRateLimited=${result.isRateLimited}`);
      results.push(result);

      if (response.status() === 429) {
        break;
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

// Re-export waitForRateLimitReset from common utils
export { waitForRateLimitReset } from '../../common/utils';

/**
 * Shared test credentials for TC-06
 */
export const TC06_USERS = [
  {
    name: 'User C',
    email: process.env.AUTH_EMAIL_C || 'eiji2',
    password: process.env.AUTH_PASSWORD_C || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/user/profile',
      '/v1/md/customer/sub-accounts?page=1&limit=25',
      '/v1/md/billing-note/customer-export-all/PENDING',
    ],
  },
  {
    name: 'User D',
    email: process.env.AUTH_EMAIL_D || 'eiji3',
    password: process.env.AUTH_PASSWORD_D || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/billing-note/customer-export-all/ALL',
      '/v1/md/billing-note/customer-export-all/UNPAID',
      '/v1/md/billing-note/customer?status=UNPAID',
    ],
  },
  {
    name: 'User E',
    email: process.env.AUTH_EMAIL_E || 'eiji8',
    password: process.env.AUTH_PASSWORD_E || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      '/v2/md/billing-note/customer?status=PAID&page=1&limit=25',
      '/v2/md/billing-note/customer?status=EXCEED&page=1&limit=25',
    ],
  },
  {
    name: 'User F',
    email: process.env.AUTH_EMAIL_F || 'eiji9',
    password: process.env.AUTH_PASSWORD_F || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/billing-note/customer?status=PAID',
      '/v1/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT',
      '/v1/md/billing-note/customer?status=EXCEED',
    ],
  },
  {
    name: 'User G',
    email: process.env.AUTH_EMAIL_G || 'eiji10',
    password: process.env.AUTH_PASSWORD_G || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v2/md/billing-note/customer?status=REFUND&page=1&limit=25',
      '/v2/md/billing-note/customer?status=VOID&page=1&limit=25',
      '/v1/md/billing-note/customer?status=REFUND',
    ],
  },
  {
    name: 'User H',
    email: process.env.AUTH_EMAIL_H || 'eiji11',
    password: process.env.AUTH_PASSWORD_H || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/billing-note/customer?status=EXCEED',
      '/v1/md/billing-note/customer?status=VOID',
      '/v2/md/billing-note/customer?status=&page=1&limit=25',
    ],
  },
  {
    name: 'User I',
    email: process.env.AUTH_EMAIL_I || 'eiji8',
    password: process.env.AUTH_PASSWORD_I || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/billing-note/customer-export-all/CANCELLED',
      '/v1/md/billing-note/customer-export-all/EXCEED',
      '/v1/md/billing-note/customer-export-all/PARTIALPAID',
    ],
  },
  {
    name: 'User J',
    email: process.env.AUTH_EMAIL_J || 'eiji9',
    password: process.env.AUTH_PASSWORD_J || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v2/md/billing-note/customer?status=PARTIALPAID&page=1&limit=25',
      '/v2/md/billing-note/customer?status=DELIVERED&page=1&limit=25',
      '/v2/md/billing-note/customer?status=VERIFYPAYMENT&page=1&limit=25',
    ],
  },
  {
    name: 'User K',
    email: process.env.AUTH_EMAIL_K || 'eiji10',
    password: process.env.AUTH_PASSWORD_K || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/customer/sub-accounts?page=2&limit=25',
      '/v1/md/customer/sub-accounts?page=3&limit=25',
      '/v1/md/customer/sub-accounts?page=1&limit=50',
    ],
  },
  {
    name: 'User L',
    email: process.env.AUTH_EMAIL_L || 'eiji11',
    password: process.env.AUTH_PASSWORD_L || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
    endpoints: [
      '/v1/md/user/profile',
      '/v1/md/billing-note/customer?status=PAID&page=1&limit=10',
      '/v1/md/billing-note/customer?status=PAID&page=2&limit=10',
    ],
  },
];

/**
 * Token cache per worker (in-memory)
 * Key: email, Value: { token, expiresAt }
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Load tokens from file cache (if exists)
 */
function loadFileCache(): Record<string, string> {
  try {
    const cacheFile = path.join(__dirname, 'token-cache.json');
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (Date.now() < cache.expiresAt - 60000) { // 1 min buffer
        console.log('[DEBUG] Loaded tokens from file cache');
        return cache.tokens || {};
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return {};
}

/**
 * Get fresh token with TOTP for a user (cached)
 * Handles rate limit by clearing and retrying once
 */
export async function getFreshToken(email: string, password: string, totp: string): Promise<string | undefined> {
  const now = Date.now();
  const cached = tokenCache.get(email);

  // Reuse token if still valid (> 5 min remaining)
  if (cached && cached.expiresAt > now + 300000) {
    console.log(`[DEBUG] Reusing in-memory cached token for: ${email}`);
    return cached.token;
  }

  // Check file cache
  const fileTokens = loadFileCache();
  if (fileTokens[email]) {
    console.log(`[DEBUG] Reusing file cached token for: ${email}`);
    tokenCache.set(email, { token: fileTokens[email], expiresAt: now + 3600000 });
    return fileTokens[email];
  }

  // Try to fetch new token (with rate limit retry)
  await clearIpRateLimit(); // Clear IP rate limit before attempting
  await new Promise(r => setTimeout(r, 2000)); // Brief pause after clear
  const token = await fetchTokenWithRetry(email, password, totp);
  if (!token) return undefined;

  // Cache it
  const expiresIn = 3600000; // 1 hour
  tokenCache.set(email, { token, expiresAt: now + expiresIn });
  console.log(`[DEBUG] Cached new token for: ${email}`);

  return token;
}

/**
 * Fetch token with rate limit handling
 * IP-based rate limit (5 req/min) resets after 61 seconds
 * User-based rate limit can be cleared via clearRateLimitForUser
 */
async function fetchTokenWithRetry(email: string, password: string, totp: string, attempt = 1): Promise<string | undefined> {
  console.log(`[DEBUG] Fetching new token for: ${email} (attempt ${attempt})`);
  const signInData = await authClient.signIn({ email, password });

  // Check if rate limited (could be IP-based or user-based)
  if (signInData?.code === 10027 || signInData?.code === 429) {
    console.warn(`[DEBUG] Sign-in rate limited (${signInData?.code}), clearing IP rate limit...`);
    await clearIpRateLimit();

    // IP-based rate limit needs full 61s to reset - clear doesn't work for this tier
    console.warn(`[DEBUG] Waiting 65s for IP rate limit window reset...`);
    await new Promise(r => setTimeout(r, 65000));
    return fetchTokenWithRetry(email, password, totp, attempt + 1);
  }

  // Check if credential error (don't retry)
  if (!signInData?.data?.token) {
    console.warn(`[DEBUG] Credential error for ${email}: ${signInData?.message} - skipping`);
    return undefined; // Don't retry credential errors
  }

  const token = signInData.data.token;
  const totpResp = await authClient.verifyTotp(token, totp, true);

  // Check if TOTP also got rate limited
  if (totpResp?.code === 10027 || totpResp?.code === 429) {
    console.warn(`[DEBUG] TOTP rate limited (${totpResp?.code}), clearing and retrying...`);
    await clearRateLimitForUser(email);
    await new Promise(r => setTimeout(r, 2000));
    return fetchTokenWithRetry(email, password, totp, attempt + 1);
  }

  // Check if TOTP credential error
  if (!totpResp?.data?.token && totpResp?.code !== 10027) {
    console.warn(`[DEBUG] TOTP error for ${email}: ${totpResp?.message} - skipping`);
    return undefined;
  }

  return totpResp?.data?.token || token;
}

/**
 * Clear rate limit for a user
 */
export async function clearRateLimitForUser(email: string): Promise<void> {
  await authClient.clearRateLimit(email);
  console.log(`[DEBUG] Cleared rate limit for: ${email}`);
}

/**
 * Clear IP-based rate limit (call without username to clear caller's IP)
 */
export async function clearIpRateLimit(): Promise<void> {
  await authClient.clearRateLimit();
  console.log(`[DEBUG] Cleared IP rate limit`);
}