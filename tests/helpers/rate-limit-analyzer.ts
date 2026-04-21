/**
 * Rate Limit Analyzer
 * Test helper for burst testing and rate limit analysis
 */

import { request, APIResponse, APIRequestContext } from '@playwright/test';
import { getApiBaseUrl, getWebUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

export interface RateLimitConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  burstSize: number;
  expectedLimit?: number;
  expectedWindow?: number;
}

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

export interface AuthCredentials {
  email: string;
  password: string;
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

export interface LoginAndBurstConfig {
  baseURL?: string;
  loginEndpoint: string;
  targetEndpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  credentials: AuthCredentials;
  burstSize?: number;
  body?: object;
  uploadFile?: { path: string; fieldName: string; mimeType?: string };
}

export interface LoginAndBurstResult {
  loginResult: any;
  burstResults: RateLimitResult[];
  token: string;
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

export async function loginAndBurstTest(config: LoginAndBurstConfig): Promise<LoginAndBurstResult> {
  const baseURL = config.baseURL || getApiBaseUrl();
  const ctx = await request.newContext();

  // Step 1: Login using auth client
  console.log(`[DEBUG] Login attempt for: ${config.credentials.email}`);
  const loginData = await authClient.signIn(config.credentials);
  let token = loginData?.data?.token || null;

  console.log(`[DEBUG] Login response status: ${loginData?.code || 'N/A'}`);
  console.log(`[DEBUG] Token obtained: ${token ? 'Yes' : 'No'}`);

  // Step 2: Get token with is_accessapi: true via TOTP
  if (token) {
    console.log(`[DEBUG] Calling TOTP verify to get is_accessapi: true...`);
    const totpKey = process.env.AUTH_2FA || '954900';
    const totpResp = await authClient.verifyTotp(token, totpKey, true);
    console.log(`[DEBUG] TOTP response status: ${totpResp?.code || 'N/A'}`);

    if (totpResp?.data?.token) {
      token = totpResp.data.token;
      console.log(`[DEBUG] Got new token with is_accessapi: true`);
    }
  }

  // Step 3: Burst test
  const burstResults = await burstTest({
    baseURL,
    endpoint: config.targetEndpoint,
    method: config.method,
    token,
    burstSize: config.burstSize,
    body: config.body,
    uploadFile: config.uploadFile,
    requestContext: ctx,
  });

  await ctx.dispose();

  return { loginResult: loginData, burstResults, token };
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
 * Wait for rate limit window to reset (65 seconds)
 */
export async function waitForRateLimitReset(): Promise<void> {
  console.log('=== Waiting 65 seconds for rate limit window to reset ===');
  await new Promise(resolve => setTimeout(resolve, 65000));
}