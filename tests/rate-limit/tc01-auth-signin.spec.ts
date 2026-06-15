import { test, expect } from '@playwright/test';
import { burstTest, ipBlocked } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-01: Sign-in Rate Limit (Strict Tier)
 *
 * Endpoint: POST /v1/md/auth/customer/sign-in — 5 req/min, key = IP.
 *
 * One smoke per tier is enough: the strict-tier middleware is path-pattern based,
 * so verify/totp share the same logic — testing all three was redundant. Window-reset
 * correctness lives in the backend fake-clock unit tests (see
 * docs/rate-limit-test-strategy.md), not in this E2E layer.
 */

test.describe('TC-01: Sign-in Rate Limit (Strict Tier)', () => {
  const baseURL = getApiBaseUrl();

  // Strict tier counts sign-in attempts by IP BEFORE auth, so creds need not be valid.
  // Use a wrong password on purpose: a SUCCESSFUL eiji login would rotate the session
  // (backend is single-session) and invalidate the cached eiji token TC-04/TC-10 reuse → 401.
  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: 'ratelimit-probe-invalid-pw',
  };

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

    const rateLimitedAt = results.findIndex((r) => r.isRateLimited) + 1;
    console.log(`Rate limited at request: ${rateLimitedAt || 'Not triggered'}`);
    expect(rateLimitedAt).toBeGreaterThan(0);
  });
});
