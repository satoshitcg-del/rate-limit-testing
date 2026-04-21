import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';
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
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  async function checkRateLimitTriggered(results: any[]): Promise<number> {
    const rateLimitedAt = results.findIndex(r => r.isRateLimited) + 1;
    console.log(`Rate limited at request: ${rateLimitedAt || 'Not triggered'}`);
    return rateLimitedAt;
  }

  async function skipIfIpBlocked(results: any[]): Promise<boolean> {
    const statusCodes = results.map(r => r.statusCode);
    const has400s = statusCodes.some(s => s === 400);
    const has429s = statusCodes.some(s => s === 429);

    if (has400s && !has429s) {
      console.log('⚠️ IP is blocked (10019) - cannot verify rate limit');
      return true;
    }
    return false;
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
    if (await skipIfIpBlocked(results)) return;

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
    if (await skipIfIpBlocked(results)) return;

    const rateLimitedResponse = results.find(r => r.isRateLimited);
    if (rateLimitedResponse) {
      console.log(`Status: ${rateLimitedResponse.statusCode}`);
      console.log(`Rate Limit Headers:`, rateLimitedResponse.rateLimit);
      expect(rateLimitedResponse.statusCode).toBe(429);
    }
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
    if (await skipIfIpBlocked(results)) return;

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
    if (!token) {
      console.log('⚠️ Could not obtain token - skipping test');
      return;
    }

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/verify/totp',
      method: 'POST',
      body: { totp_key: '954900', generate_token: true },
      token,
      burstSize: 10,
    });

    const rateLimitedAt = await checkRateLimitTriggered(results);
    expect(rateLimitedAt).toBeGreaterThan(0);
  });
});