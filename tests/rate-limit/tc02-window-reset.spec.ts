import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-02: ทดสอบ Window Reset
 *
 * พฤติกรรมที่คาดหวัง:
 * - Rate limit window จะ reset หลังจาก 61 วินาที
 * - หลัง window reset คำขอใหม่ควรถูกอนุญาต
 */

test.describe('TC-02: Window Reset', () => {
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  let token: string;

  test.beforeAll(async () => {
    const loginData = await authClient.signIn(credentials);
    token = loginData?.data?.token;
    console.log(`[DEBUG] Token obtained for: ${credentials.email}`);
  });

  async function checkAfterReset(): Promise<boolean> {
    const response = await authClient.signIn(credentials);
    if (response?.code === 10019) {
      console.log('⚠️ IP is blocked (10019) - cannot verify window reset');
      return false;
    }
    return response?.data?.token ? true : false;
  }

  test('TC-02-01: ควรอนุญาตให้ส่ง request หลัง window reset 61 วินาที', async () => {
    test.setTimeout(120000);

    console.log('\n=== TC-02-01: Window Reset Test ===');
    console.log('Step 1: Hitting rate limit...');

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 15,
    });

    const rateLimitedAt = results.find(r => r.isRateLimited)?.requestCount;
    console.log(`Rate limited at request #${rateLimitedAt}`);
    expect(rateLimitedAt).toBeDefined();

    console.log('Step 2: Waiting 61 seconds for window reset...');
    await new Promise(resolve => setTimeout(resolve, 61000));

    console.log('Step 3: Testing after window reset...');
    const canReset = await checkAfterReset();
    expect(canReset).toBe(true);
  });

  test('TC-02-02: Rate limit counter ควร reset ที่ window boundary', async () => {
    test.setTimeout(120000);

    console.log('\n=== TC-02-02: Counter Reset at Boundary ===');
    console.log('Step 1: Hitting rate limit...');

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 6,
    });

    const firstWindowLimited = results.some(r => r.isRateLimited);

    if (firstWindowLimited) {
      console.log('First window: Rate limited (as expected)');
      console.log('Waiting 61 seconds...');
      await new Promise(resolve => setTimeout(resolve, 61000));

      console.log('Step 2: Testing new window...');
      const canReset = await checkAfterReset();
      expect(canReset).toBe(true);
    } else {
      console.log('Note: Rate limit not triggered in this test run');
    }
  });
});