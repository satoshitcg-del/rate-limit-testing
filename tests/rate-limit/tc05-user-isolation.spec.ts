import { test, expect } from '@playwright/test';
import { burstTest, clearRateLimitForUser } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-05: User Isolation
 *
 * payment/standard tiers are keyed by userID → User A getting rate limited must NOT
 * affect User B (separate counters).
 *
 * Design notes:
 * - Login once in `beforeAll` (shared across both tests) — avoids re-paying the 65s
 *   IP-window wait per test.
 * - Reset state between tests with `clearRateLimitForUser` (instant) instead of sleeping
 *   65s for the window to reset — faster AND deterministic.
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
    userAToken = await authClient.getTokenWithTotp(userA);
    console.log(`[DEBUG] userA token: ${userAToken ? 'OK' : 'FAILED'}`);
    // wait 65s before userB sign-in to avoid the strict (IP) sign-in limit
    if (userAToken) {
      console.log('[DEBUG] Waiting 65s before userB sign-in to avoid IP rate limit...');
      await new Promise((r) => setTimeout(r, 65000));
    }
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

  test('TC-05-02: User B ไม่ควรโดน block เมื่อ User A โดน rate limit', async () => {
    test.skip(!userAToken, 'ไม่ได้ token User A — ข้าม (ไม่ใช่ pass)');
    test.skip(!userBToken, 'ไม่ได้ token User B (admintest creds?) — ข้าม (ไม่ใช่ pass)');

    // reset ทั้งคู่จาก test ก่อนหน้า → A เริ่มสด, B เริ่มสด
    await clearRateLimitForUser(userA.email);
    await clearRateLimitForUser(userB.email);

    // ทำให้ User A โดน limit
    await burstTest({ baseURL, endpoint: PAYMENT, method: 'POST', token: userAToken!, body: paymentBody, burstSize: 12 });
    console.log('User A blocked. User B sending requests...');
    await new Promise((r) => setTimeout(r, 1000));

    const userBResults = await burstTest({ baseURL, endpoint: PAYMENT, method: 'POST', token: userBToken!, body: paymentBody, burstSize: 5 });
    const userBRateLimitedCount = userBResults.filter((r) => r.statusCode === 429).length;
    const userB400 = userBResults.filter((r) => r.statusCode === 400).length;
    const userB200 = userBResults.filter((r) => r.statusCode === 200).length;
    console.log(`User B: ${userB200} ok, ${userB400} got 400, ${userBRateLimitedCount} got 429`);

    // User B ต้องไม่โดน 429 (counter แยกจาก A); 400 = ยิงถึง endpoint แต่ invoice ไม่ใช่ของตัว → ผ่าน limit ของ A
    expect(userBRateLimitedCount, 'User B ไม่ควรโดน 429 (counter แยกจาก A)').toBe(0);
  });
});
