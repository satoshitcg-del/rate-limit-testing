import { test, expect } from '@playwright/test';
import { burstTest, ipBlocked } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-07: Response contract when rate limited.
 *
 * The "status is 429" checks were redundant with tc01/tc04/tc06 (every tier already
 * asserts it triggers). What is UNIQUE here is the BODY contract: code = 10027.
 */

test.describe('TC-07: Response Format when Rate Limited', () => {
  const baseURL = getApiBaseUrl();

  // Wrong password on purpose — see tc01: rate limit counts by IP pre-auth, and a real
  // eiji login here would rotate the single-session token that tc04/tc10 reuse.
  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: 'ratelimit-probe-invalid-pw',
  };

  test('TC-07-02: 429 body ต้องมี code = 10027', async () => {
    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 15,
    });

    console.log('\n=== TC-07-02: Error Code Validation ===');
    test.skip(ipBlocked(results), 'IP ถูกบล็อก (10019) — ตรวจ error code ไม่ได้ (ไม่ใช่ pass)');

    const rateLimitedResult = results.find((r) => r.isRateLimited);
    expect(rateLimitedResult, 'ต้องเกิด 429 ก่อนตรวจ code').toBeDefined();
    console.log(`Rate limit code: ${rateLimitedResult!.rateLimitCode}, Expected: 10027`);
    expect(rateLimitedResult!.rateLimitCode, 'body.code ตอนโดน rate limit ต้อง = 10027').toBe(10027);
  });
});
