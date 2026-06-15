import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults, getFreshToken, clearRateLimitForUser } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-06: Standard Routes Rate Limit (60 req/min, key = userID)
 *
 * Trimmed from 30 tests (10 users × 3 endpoints) to a focused set. Rationale:
 *   - the standard-tier middleware is path-pattern based — same logic for every CUSTOMER
 *     route (ACC-1138) — so a couple of representative routes prove it; no need for 24.
 *   - per-user isolation is already covered by tc05; clear-resets by tc10.
 * → ONE user + 2 routes is enough. Serial (shared per-user counter + 60s window).
 */

const baseURL = getApiBaseUrl();

const USER = {
  email: process.env.AUTH_EMAIL_C || 'eiji2',
  password: process.env.AUTH_PASSWORD_C || '',
  totp: process.env.AUTH_2FA || '',
};

// Two distinct CUSTOMER routes — to prove the counter is shared ACROSS routes per user.
const ROUTE_A = '/v1/md/user/profile';
const ROUTE_B = '/v1/md/customer/sub-accounts?page=1&limit=25';

test.describe('TC-06: Standard Routes Rate Limit (60 req/min)', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300000);

  test('TC-06-01: standard route ต้องโดน 429 หลังเกิน 60/min', async () => {
    const token = await getFreshToken(USER.email, USER.password, USER.totp);
    test.skip(!token, `ไม่ได้ token ${USER.email} — ข้าม (ไม่ใช่ pass)`);

    await clearRateLimitForUser(USER.email);
    const analysis = analyzeRateLimitResults(
      await burstTest({ baseURL, endpoint: ROUTE_A, method: 'GET', token: token!, burstSize: 80 }),
    );
    console.log(`Rate limited at #${analysis.rateLimitedAt ?? 'N/A'}`);
    expect(analysis.rateLimited, 'standard route ต้องโดน 429 ภายใน 80 req').toBe(true);
  });

  test('TC-06-02: counter แชร์ข้าม route (ราย userID)', async () => {
    const token = await getFreshToken(USER.email, USER.password, USER.totp);
    test.skip(!token, `ไม่ได้ token ${USER.email} — ข้าม (ไม่ใช่ pass)`);

    await clearRateLimitForUser(USER.email);
    // ยิง route A จนโดน limit
    const a = analyzeRateLimitResults(
      await burstTest({ baseURL, endpoint: ROUTE_A, method: 'GET', token: token!, burstSize: 80 }),
    );
    expect(a.rateLimited, 'route A ต้องโดน limit ก่อน').toBe(true);

    // route B (คนละ route, user เดิม) ต้องโดน 429 ด้วย → counter แชร์ข้าม route
    const b = await burstTest({ baseURL, endpoint: ROUTE_B, method: 'GET', token: token!, burstSize: 3 });
    const bBlocked = b.some((r) => r.statusCode === 429);
    console.log(`route B blocked (shared counter): ${bBlocked}`);
    expect(bBlocked, 'route B ต้องโดน 429 ด้วย (counter แชร์ข้าม route ราย user)').toBe(true);
  });
});
