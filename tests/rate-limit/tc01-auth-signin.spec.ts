import { test, expect } from '@playwright/test';
import { burstTest, ipBlocked } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-01: ทดสอบ Rate Limit ของ Sign-in (Strict Tier)
 *
 * Endpoint: POST /v1/md/auth/customer/sign-in
 * จำกัด: 5 ครั้ง/นาที
 * Key: IP
 */

test.describe('TC-01: Sign-in Rate Limit (Strict Tier)', () => {
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '',
  };

  async function checkRateLimitTriggered(results: any[]): Promise<number> {
    const rateLimitedAt = results.findIndex(r => r.isRateLimited) + 1;
    console.log(`Rate limited at request: ${rateLimitedAt || 'Not triggered'}`);
    return rateLimitedAt;
  }

  test('TC-01-01: Sign-in endpoint ควรถูก rate limit หลังจาก 5 ครั้ง', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 15,
    });

    console.log('\n=== TC-01-01: Sign-in Rate Limit ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ตรวจ rate limit ไม่ได้ (ไม่ใช่ pass)');

    const rateLimitedAt = await checkRateLimitTriggered(results);
    expect(rateLimitedAt).toBeGreaterThan(0);
  });

  test('TC-01-02: Response ที่โดน rate limit ควรมี headers ที่ถูกต้อง', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 15,
    });

    console.log('\n=== TC-01-02: Rate Limit Response Headers ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ตรวจ rate limit ไม่ได้ (ไม่ใช่ pass)');

    const rateLimitedResponse = results.find(r => r.isRateLimited);
    expect(rateLimitedResponse, 'ต้องเกิด 429 ภายใน burst').toBeDefined();
    console.log(`Status: ${rateLimitedResponse!.statusCode}`);
    console.log(`Rate Limit Headers:`, rateLimitedResponse!.rateLimit);
    expect(rateLimitedResponse!.statusCode).toBe(429);
  });

  test('TC-01-03: Verify endpoint ควรถูก rate limit เช่นกัน', async () => {
    test.setTimeout(120000);
    console.log('=== Waiting 65 seconds for rate limit window to reset ===');
    await new Promise(resolve => setTimeout(resolve, 65000));

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/verify',
      method: 'POST',
      body: { email: credentials.email, password: credentials.password, captcha: '1234' },
      burstSize: 10,
    });

    console.log('\n=== TC-01-03: Verify Endpoint Rate Limit ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ตรวจ rate limit ไม่ได้ (ไม่ใช่ pass)');

    const rateLimitedAt = await checkRateLimitTriggered(results);
    expect(rateLimitedAt).toBeGreaterThan(0);
  });

  test('TC-01-04: TOTP verify endpoint ควรถูก rate limit เช่นกัน', async () => {
    test.setTimeout(120000);
    console.log('=== Waiting 65 seconds for rate limit window to reset ===');
    await new Promise(resolve => setTimeout(resolve, 65000));

    // Login to get token
    const loginData = await authClient.signIn(credentials);
    const token = loginData?.data?.token;

    console.log('\n=== TC-01-04: TOTP Verify Endpoint Rate Limit ===');
    console.log(`Token obtained: ${token ? 'Yes' : 'No'}`);
    test.skip(!token, 'ไม่ได้ token — ข้าม (ไม่ใช่ pass)');

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/verify/totp',
      method: 'POST',
      body: { totp_key: process.env.AUTH_2FA || '', generate_token: true },
      token,
      burstSize: 10,
    });

    const rateLimitedAt = await checkRateLimitTriggered(results);
    expect(rateLimitedAt).toBeGreaterThan(0);
  });
});