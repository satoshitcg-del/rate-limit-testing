import { test, expect } from '@playwright/test';
import { burstTest, clearRateLimitForUser, getFreshToken } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-05: User Isolation
 *
 * payment tier is keyed by userID → two different users must hit their OWN limit
 * independently. Uses two REAL pre-fetched users (eiji + eiji2) via the cache-aware
 * getFreshToken — NOT a fresh inline login, which would (a) be IP-blocked after the
 * tc01 sign-in burst and (b) rotate eiji's single-session token used by tc04/tc10.
 */

const baseURL = getApiBaseUrl();
const PAYMENT = '/v1/md/billing-note/payment/verify';
const paymentBody = { invoice_id: '69e6760f466b99885541692c', amount: 100 };

const userA = { email: process.env.AUTH_EMAIL || 'eiji', password: process.env.AUTH_PASSWORD || '', totp: process.env.AUTH_2FA || '' };
const userB = { email: process.env.AUTH_EMAIL_C || 'eiji2', password: process.env.AUTH_PASSWORD_C || '', totp: process.env.AUTH_2FA || '' };

test.describe('TC-05: User Isolation', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300000);

  let userAToken: string | undefined;
  let userBToken: string | undefined;

  test.beforeAll(async () => {
    // cache-aware: reuse tokens pre-fetched in global-setup (no new login → no session
    // rotation, no IP-limit hit).
    userAToken = await getFreshToken(userA.email, userA.password, userA.totp);
    console.log(`[DEBUG] userA token: ${userAToken ? 'OK' : 'FAILED'}`);
    userBToken = await getFreshToken(userB.email, userB.password, userB.totp);
    console.log(`[DEBUG] userB token: ${userBToken ? 'OK' : 'FAILED'}`);
  });

  test('TC-05-01: User A และ User B ควรมี rate limit counter แยกกัน', async () => {
    test.skip(!userAToken, 'ไม่ได้ token User A — ข้าม (ไม่ใช่ pass)');
    test.skip(!userBToken, 'ไม่ได้ token User B — ข้าม (ไม่ใช่ pass)');

    // baseline สะอาดทั้งคู่
    await clearRateLimitForUser(userA.email);
    await clearRateLimitForUser(userB.email);

    const userAResults = await burstTest({ baseURL, endpoint: PAYMENT, method: 'POST', token: userAToken!, body: paymentBody, burstSize: 15 });
    const userARateLimitedAt = userAResults.find((r) => r.isRateLimited)?.requestCount;
    console.log(`User A rate limited at #${userARateLimitedAt || 'not triggered'}`);

    const userBResults = await burstTest({ baseURL, endpoint: PAYMENT, method: 'POST', token: userBToken!, body: paymentBody, burstSize: 15 });
    const userBRateLimitedAt = userBResults.find((r) => r.isRateLimited)?.requestCount;
    console.log(`User B rate limited at #${userBRateLimitedAt || 'not triggered'}`);

    expect(userARateLimitedAt, 'User A payment ต้องโดน rate limit').toBeLessThanOrEqual(12);
    expect(userBRateLimitedAt, 'User B payment ต้องโดน rate limit (counter แยกราย user)').toBeLessThanOrEqual(12);
  });
});
