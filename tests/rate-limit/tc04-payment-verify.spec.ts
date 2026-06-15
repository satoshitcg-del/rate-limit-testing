import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults, getFreshToken } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-04: ทดสอบ Rate Limit ของ Payment Verify (Payment Tier)
 *
 * Endpoint: POST /v1/md/billing-note/payment/verify — 10 req/min, key = userID.
 *
 * ใช้ getFreshToken (cache-aware) — eiji ถูก pre-fetch ใน global-setup จึงไม่ต้อง login สด
 * หลัง TC-01 (ที่เพิ่งเผา IP strict-tier limit) → เลี่ยง skip จาก IP block. (เดิม login สด
 * inline + fallback pre-2FA token → ทั้ง skip และเสี่ยง 401.)
 */

test.describe('TC-04: Payment Verify Rate Limit (Payment Tier)', () => {
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '',
    totp: process.env.AUTH_2FA || '',
  };

  const paymentBody = { invoice_id: '69e6760f466b99885541692c', amount: 100 };

  test('TC-04-01: Payment verify ควรถูก rate limit หลัง 10 ครั้ง', async () => {
    const token = await getFreshToken(credentials.email, credentials.password, credentials.totp);
    console.log(`\n=== TC-04-01: Payment Verify Rate Limit ===`);
    console.log(`Login success: ${!!token}`);
    test.skip(!token, 'ไม่ได้ token — ข้าม payment rate limit test (ไม่ใช่ pass)');

    const result = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token,
      burstSize: 15,
      body: paymentBody,
    });

    const analysis = analyzeRateLimitResults(result);
    console.log(`Rate limited: ${analysis.rateLimited}, at: ${analysis.rateLimitedAt || 'N/A'}`);

    // payment tier = 10 req/min: burst 15 ต้องเกิด rate limit เสมอ
    expect(analysis.rateLimited, 'payment verify ต้องโดน rate limit หลังเกิน 10 ครั้ง').toBe(true);
    // ควร trigger ~ครั้งที่ 11; เผื่อ timing variance ถึง 13
    expect(analysis.rateLimitedAt).toBeLessThanOrEqual(13);
  });
});
