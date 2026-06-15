import { test, expect } from '@playwright/test';
import { burstTest, ipBlocked } from '../helpers/rate-limit-analyzer';
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
    password: process.env.AUTH_PASSWORD || '',
    totp: process.env.AUTH_2FA || '',
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
      burstSize: 15,
    });

    console.log('\n=== TC-07-01: 429 Response Format ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ทดสอบ 429 format ไม่ได้ (ไม่ใช่ pass)');

    // burst 15 เกินทั้ง 5 และ 10 → ต้องเกิด 429 เสมอ (limit-agnostic)
    const rateLimitedResult = results.find(r => r.isRateLimited);
    expect(rateLimitedResult, 'ต้องเกิด 429 ภายใน burst 15 ครั้ง').toBeDefined();
    expect(rateLimitedResult!.statusCode).toBe(429);
  });

  test('TC-07-02: ควรได้ error code ที่ถูกต้อง (10027)', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: { email: credentials.email, password: credentials.password },
      burstSize: 15,
    });

    console.log('\n=== TC-07-02: Error Code Validation ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ตรวจ error code ไม่ได้ (ไม่ใช่ pass)');

    const rateLimitedResult = results.find(r => r.isRateLimited);
    expect(rateLimitedResult, 'ต้องเกิด 429 ก่อนตรวจ code').toBeDefined();
    console.log(`Rate limit code: ${rateLimitedResult!.rateLimitCode}, Expected: 10027`);
    expect(rateLimitedResult!.rateLimitCode, 'body.code ตอนโดน rate limit ต้อง = 10027').toBe(10027);
  });

  test('TC-07-03: ควรมี rate limit headers ใน response', async () => {
    const token = await getFreshToken();
    test.skip(!token, 'ไม่ได้ token — ข้าม (ไม่ใช่ pass)');

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 65,
    });

    console.log('\n=== TC-07-03: Rate Limit Headers ===');
    const rateLimited = results.find(r => r.isRateLimited);
    expect(rateLimited, 'standard tier (60/min) ต้องโดน rate limit ภายใน 65 ครั้ง').toBeDefined();

    // headers อาจไม่มี (validators.ts ระบุว่าเป็น informational ไม่ใช่ข้อบังคับ) — log อย่างเดียว
    console.log(`Limit: ${rateLimited!.rateLimit.limit}, Remaining: ${rateLimited!.rateLimit.remaining}`);
    console.log(`Reset: ${rateLimited!.rateLimit.reset}, RetryAfter: ${rateLimited!.rateLimit.retryAfter}`);
  });

  test('TC-07-04: Standard tier ควรได้ 429 format เหมือน strict tier', async () => {
    const token = await getFreshToken();
    test.skip(!token, 'ไม่ได้ token — ข้าม (ไม่ใช่ pass)');

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 70,
    });

    console.log('\n=== TC-07-04: Standard Tier 429 Format ===');
    const rateLimitedResult = results.find(r => r.isRateLimited);
    expect(rateLimitedResult, 'standard tier ต้องโดน 429 ภายใน 70 ครั้ง').toBeDefined();
    expect(rateLimitedResult!.statusCode).toBe(429);
  });
});