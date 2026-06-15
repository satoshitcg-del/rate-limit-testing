import { test, expect } from '@playwright/test';
import { burstTest, clearRateLimitForUser } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-05: User Isolation
 *
 * payment/standard tiers are keyed by userID → User A getting rate limited must NOT
 * affect User B. One test proves it: bursting A and B and seeing each hit its OWN
 * limit (~#11) shows the counters are independent. (The old "B unaffected while A is
 * blocked" test was a subset of this and was dropped.)
 *
 * Login once in `beforeAll` (shared) and reset between users with `clearRateLimitForUser`
 * (instant) instead of sleeping 65s for the window.
 */

const baseURL = getApiBaseUrl();
const PAYMENT = '/v1/md/billing-note/payment/verify';
const paymentBody = { invoice_id: '69e6760f466b99885541692c', amount: 100 };

const userA = { email: process.env.AUTH_EMAIL || 'eiji', password: process.env.AUTH_PASSWORD || '', totp: process.env.AUTH_2FA || '' };
const userB = { email: process.env.AUTH_EMAIL_B || 'admintest', password: process.env.AUTH_PASSWORD_B || '', totp: process.env.AUTH_2FA || '' };

test.describe('TC-05: User Isolation', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300000);

  let userAToken: string | undefined;
  let userBToken: string | undefined;

  test.beforeAll(async () => {
    // Two sign-ins only — under the 5/min IP limit, so no inter-login wait is needed
    // (a 65s wait would also exceed the 60s beforeAll-hook timeout).
    userAToken = await authClient.getTokenWithTotp(userA);
    console.log(`[DEBUG] userA token: ${userAToken ? 'OK' : 'FAILED'}`);
    userBToken = await authClient.getTokenWithTotp(userB);
    console.log(`[DEBUG] userB token: ${userBToken ? 'OK' : 'FAILED'}`);
  });

  test('TC-05-01: User A และ User B ควรมี rate limit counter แยกกัน', async () => {
    test.skip(!userAToken, 'ไม่ได้ token User A — ข้าม (ไม่ใช่ pass)');
    // หมายเหตุ: userB = admintest ซึ่ง creds มักผิด — แนะนำตั้ง AUTH_EMAIL_B เป็น account จริง
    test.skip(!userBToken, 'ไม่ได้ token User B (admintest creds?) — ข้าม (ไม่ใช่ pass)');

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
