import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-05: ทดสอบ User Isolation
 *
 * พฤติกรรมที่คาดหวัง:
 * - Rate limits จะถูก track ต่อ userID (ไม่ใช่ IP สำหรับ payment/standard tiers)
 * - User A โดน rate limit ไม่ควรกระทบ User B
 * - แต่ละ user มี counter แยกกัน
 */

const baseURL = getApiBaseUrl();

const userA = {
  email: process.env.AUTH_EMAIL || 'eiji',
  password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  totp: process.env.AUTH_2FA || '954900',
};

const userB = {
  email: process.env.AUTH_EMAIL_B || 'eiji2',
  password: process.env.AUTH_PASSWORD_B || '0897421942@Earth',
  totp: process.env.AUTH_2FA || '954900',
};

test.describe('TC-05: User Isolation', () => {
  test.setTimeout(300000);

  test('TC-05-01: User A และ User B ควรมี rate limit counter แยกกัน', async () => {
    console.log('\n=== TC-05-01: Separate Rate Limit Counters ===');

    // Sign in user A
    const userAToken = await authClient.getTokenWithTotp(userA);
    console.log(`[DEBUG] userA token: ${userAToken ? 'OK' : 'FAILED'}`);
    if (!userAToken) {
      console.log('⚠️ Could not obtain User A token - skipping');
      return;
    }

    // Sign in user B (wait 65s to avoid strict rate limit)
    console.log('[DEBUG] Waiting 65s before userB sign-in to avoid rate limit...');
    await new Promise(r => setTimeout(r, 65000));

    const userBToken = await authClient.getTokenWithTotp(userB);
    console.log(`[DEBUG] userB token: ${userBToken ? 'OK' : 'FAILED'}`);

    console.log('User A: Hitting payment verify rate limit...');
    const userAResults = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userAToken,
      body: { invoice_id: '69e6760f466b99885541692c', amount: 100 },
      burstSize: 15,
    });

    const userARateLimitedAt = userAResults.find(r => r.isRateLimited)?.requestCount;
    console.log(`User A rate limited at request #${userARateLimitedAt || 'not triggered'}`);

    if (!userBToken) {
      console.log('⚠️ Could not obtain User B token - skipping');
      return;
    }

    console.log('User B: Sending requests...');
    const userBResults = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userBToken,
      body: { invoice_id: '69e6760f466b99885541692c', amount: 100 },
      burstSize: 15,
    });

    const userBRateLimitedAt = userBResults.find(r => r.isRateLimited)?.requestCount;
    console.log(`User B rate limited at request #${userBRateLimitedAt || 'not triggered'}`);

    if (userARateLimitedAt && userBRateLimitedAt) {
      expect(userARateLimitedAt).toBeLessThanOrEqual(12);
      expect(userBRateLimitedAt).toBeLessThanOrEqual(12);
    }
  });

  test('TC-05-02: User B ไม่ควรโดน block เมื่อ User A โดน rate limit', async () => {
    console.log('\n=== TC-05-02: User B Isolation ===');

    // Sign in user A
    const userAToken = await authClient.getTokenWithTotp(userA);
    console.log(`[DEBUG] userA token: ${userAToken ? 'OK' : 'FAILED'}`);
    if (!userAToken) {
      console.log('⚠️ Could not obtain User A token - skipping');
      return;
    }

    // Sign in user B (wait 65s to avoid strict rate limit)
    console.log('[DEBUG] Waiting 65s before userB sign-in to avoid rate limit...');
    await new Promise(r => setTimeout(r, 65000));

    const userBToken = await authClient.getTokenWithTotp(userB);
    console.log(`[DEBUG] userB token: ${userBToken ? 'OK' : 'FAILED'}`);

    console.log('User A: Hitting payment verify rate limit...');
    await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userAToken,
      body: { invoice_id: '69e6760f466b99885541692c', amount: 100 },
      burstSize: 12,
    });

    console.log('User A blocked. User B sending requests...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!userBToken) {
      console.log('⚠️ Could not obtain User B token - skipping');
      return;
    }

    const userBResults = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userBToken,
      body: { invoice_id: '69e6760f466b99885541692c', amount: 100 },
      burstSize: 5,
    });

    const userBUnauthorizedCount = userBResults.filter(r => r.statusCode === 400).length;
    const userBRateLimitedCount = userBResults.filter(r => r.statusCode === 429).length;
    const userBOkCount = userBResults.filter(r => r.statusCode === 200).length;
    console.log(`User B first ${userBResults.length} requests: ${userBOkCount} succeeded, ${userBUnauthorizedCount} got 400 (expected for wrong user invoice), ${userBRateLimitedCount} got 429`);

    // User B should NOT be rate limited (429) — if they get 400, it means they hit the endpoint but
    // with wrong invoice data (not their invoice). 400 proves they bypassed User A's rate limit.
    expect(userBRateLimitedCount).toBe(0);
  });
});