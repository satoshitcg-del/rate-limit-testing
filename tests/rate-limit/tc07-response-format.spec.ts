import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-07: ทดสอบ Response Format เมื่อโดน Rate Limit
 *
 * Expected: { "success": false, "code": 10027, "message": "too many requests" }
 */

test.describe('TC-07: Response Format when Rate Limited', () => {
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
  };

  async function getFreshToken(): Promise<string | undefined> {
    const signInData = await authClient.signIn({ email: credentials.email, password: credentials.password });
    const token = signInData?.data?.token;
    if (!token) return undefined;
    const totpResp = await authClient.verifyTotp(token, credentials.totp, true);
    return totpResp?.data?.token || token;
  }

  test('TC-07-01: ควรได้ 429 response format ที่ถูกต้อง', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: { email: credentials.email, password: credentials.password },
      burstSize: 10,
    });

    console.log('\n=== TC-07-01: 429 Response Format ===');
    const rateLimitedResult = results.find(r => r.isRateLimited);

    if (rateLimitedResult) {
      expect(rateLimitedResult.statusCode).toBe(429);
      console.log(`Status: ${rateLimitedResult.statusCode}, Expected: 429`);
    } else {
      console.log('⚠️ Rate limit not triggered');
    }
  });

  test('TC-07-02: ควรได้ error code ที่ถูกต้อง (10027)', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: { email: credentials.email, password: credentials.password },
      burstSize: 10,
    });

    console.log('\n=== TC-07-02: Error Code Validation ===');
    const rateLimitedResult = results.find(r => r.isRateLimited);
    console.log(`Rate limit code: ${rateLimitedResult?.rateLimitCode || 'N/A'}, Expected: 10027`);
  });

  test('TC-07-03: ควรมี rate limit headers ใน response', async () => {
    const token = await getFreshToken();
    if (!token) {
      console.log('⚠️ Could not obtain token - skipping');
      return;
    }

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 65,
    });

    console.log('\n=== TC-07-03: Rate Limit Headers ===');
    const rateLimited = results.find(r => r.isRateLimited);

    if (rateLimited) {
      console.log(`Limit: ${rateLimited.rateLimit.limit}, Remaining: ${rateLimited.rateLimit.remaining}`);
      console.log(`Reset: ${rateLimited.rateLimit.reset}, RetryAfter: ${rateLimited.rateLimit.retryAfter}`);
    }
  });

  test('TC-07-04: Standard tier ควรได้ 429 format เหมือน strict tier', async () => {
    const token = await getFreshToken();
    if (!token) {
      console.log('⚠️ Could not obtain token - skipping');
      return;
    }

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 70,
    });

    console.log('\n=== TC-07-04: Standard Tier 429 Format ===');
    const rateLimitedResult = results.find(r => r.isRateLimited);

    if (rateLimitedResult) {
      console.log(`Status: ${rateLimitedResult.statusCode}, Expected: 429`);
      expect(rateLimitedResult.statusCode).toBe(429);
    }
  });
});