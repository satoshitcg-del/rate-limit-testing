import { APIResponse, APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
}

export interface AuthCredentials {
  email: string;
  password: string;
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

async function createRequestContext(): Promise<APIRequestContext> {
  const { request } = await import('@playwright/test');
  return await request.newContext();
}

export async function burstTest(config: {
  baseURL: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  burstSize?: number;
  body?: object;
  requestContext?: APIRequestContext;
  uploadFile?: { path: string; fieldName: string; mimeType?: string };
}): Promise<RateLimitResult[]> {
  const { baseURL, endpoint, method, token, burstSize = 100, body, requestContext, uploadFile } = config;
  const results: RateLimitResult[] = [];

  // Create context if not provided
  const ctx = requestContext || await createRequestContext();

  const doRequest = methodToFunction(ctx, method);

  for (let i = 1; i <= burstSize; i++) {
    const headers: Record<string, string> = {
      'Origin': 'https://sit.askmebill.com',
      'Referer': 'https://sit.askmebill.com/',
      'Accept': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let statusCode = 0;
    let responseBody: any = null;
    let errorMsg: string | undefined;

    try {
      let response;
      // If uploadFile is provided, use multipart form data
      if (uploadFile) {
        const { path, fieldName, mimeType } = uploadFile;
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
      let rateLimitCode: number | undefined;
      let rateLimitMessage: string | undefined;

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
      errorMsg = e.message;
      console.log(`[burstTest] Request ${i}: ERROR - ${errorMsg}`);

      const result: RateLimitResult = {
        endpoint,
        statusCode: 0,
        rateLimit: { limit: null, remaining: null, reset: null, retryAfter: null },
        isRateLimited: false,
        requestCount: i,
      };

      results.push(result);
    }
  }

  return results;
}

export async function loginAndBurstTest(config: {
  baseURL?: string;
  loginEndpoint: string;
  targetEndpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  credentials: AuthCredentials;
  burstSize?: number;
  body?: object;
  uploadFile?: { path: string; fieldName: string; mimeType?: string };
}): Promise<{ loginResult: any; burstResults: RateLimitResult[]; token: string }> {
  const baseURL = config.baseURL || process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  // Create a new context for login
  const { request } = await import('@playwright/test');
  const ctx = await request.newContext();

  // Step 1: Login
  const loginResponse = await ctx.post(`${baseURL}${config.loginEndpoint}`, {
    data: config.credentials,
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://sit.askmebill.com',
      'Referer': 'https://sit.askmebill.com/',
      'Accept': 'application/json',
    },
  });
  const loginBody = await loginResponse.json();
  const loginData = Array.isArray(loginBody) ? loginBody[0] : loginBody;
  let token = loginData?.data?.token || null;

  // Debug: log login response
  console.log(`[DEBUG] Login response status: ${loginResponse.status()}`);
  console.log(`[DEBUG] Login response body:`, JSON.stringify(loginBody, null, 2));

  // Step 2: Call TOTP verify to get token with is_accessapi: true
  if (token) {
    console.log(`[DEBUG] Calling TOTP verify to get is_accessapi: true...`);
    const totpResponse = await ctx.post(`${baseURL}/v1/md/auth/verify/totp`, {
      data: { totp_key: '954900', generate_token: true },
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://sit.askmebill.com',
        'Referer': 'https://sit.askmebill.com/',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const totpBody = await totpResponse.json();
    console.log(`[DEBUG] TOTP response status: ${totpResponse.status()}`);
    console.log(`[DEBUG] TOTP response body:`, JSON.stringify(totpBody, null, 2));

    // Get new token from TOTP response
    if (totpBody?.data?.token) {
      token = totpBody.data.token;
      console.log(`[DEBUG] Got new token with is_accessapi: true`);
    }
  }

  // Step 3: Burst test on target endpoint
  const burstResults = await burstTest({
    baseURL,
    endpoint: config.targetEndpoint,
    method: config.method,
    token,
    burstSize: config.burstSize,
    uploadFile: config.uploadFile,
    body: config.body,
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
  const remainingSequence = results.map(r => r.rateLimit.remaining);

  return {
    totalRequests: results.length,
    rateLimited: rateLimitedResults.length > 0,
    rateLimitedAt: rateLimitedResults[0]?.requestCount,
    retryAfterValue: rateLimitedResults[0]?.rateLimit.retryAfter ?? undefined,
    limitHeader: results[0]?.rateLimit.limit ?? undefined,
    remainingSequence,
    rateLimitCode: rateLimitedResults[0]?.rateLimitCode,
    rateLimitMessage: rateLimitedResults[0]?.rateLimitMessage,
  };
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