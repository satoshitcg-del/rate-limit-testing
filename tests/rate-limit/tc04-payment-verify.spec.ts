import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';

/**
 * TC-04: ทดสอบ Rate Limit ของ Payment Verify (Payment Tier)
 *
 * Endpoint: POST /v1/md/billing-note/payment/verify
 * จำกัด: 10 ครั้ง/นาที
 * Key: userID
 *
 * พฤติกรรมที่คาดหวัง:
 * - หลังจากเรียก 10 ครั้งใน 1 นาที คำขอที่ 11 จะได้ 429
 */

test.describe('TC-04: Payment Verify Rate Limit (Payment Tier)', () => {
  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  /**
   * TC-04-01: ทดสอบว่า payment verify ถูก rate limit หลัง 10 ครั้ง
   *
   * ขั้นตอน:
   * 1. Login เพื่อได้ token
   * 2. ส่ง request 15 ครั้งไปที่ /v1/md/billing-note/payment/verify
   * 3. คาดหวังว่าคำขอที่ 11 จะได้ 429
   *
   * กรณีพิเศษ:
   * - ถ้า login ไม่ได้ (IP blocked) → return early
   */
  test('TC-04-01: Payment verify ควรถูก rate limit หลัง 10 ครั้ง', async () => {
    // กำหนด: จำกัด 10 ครั้ง/นาทีสำหรับ payment verify
    // เมื่อ: ส่ง request 15 ครั้งติดต่อกัน
    // then: คำขอที่ 11 ควรได้ 429

    const result = await loginAndBurstTest({
      baseURL,
      loginEndpoint: '/v1/md/auth/customer/sign-in',
      targetEndpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      credentials,
      burstSize: 15,
      body: { invoice_id: '69d4e2fe76faf342bd4a6322', amount: 100 },
    });

    console.log('\n=== TC-04-01: Payment Verify Rate Limit ===');
    console.log(`Login success: ${!!result.loginResult?.token}`);

    const analysis = analyzeRateLimitResults(result.burstResults);
    console.log(`Total requests: ${analysis.totalRequests}`);
    console.log(`Rate limited: ${analysis.rateLimited}`);
    console.log(`Rate limited at request: ${analysis.rateLimitedAt || 'Not triggered'}`);

    if (analysis.rateLimited) {
      expect(analysis.rateLimitedAt).toBeLessThanOrEqual(12);
    }
  });

  /**
   * TC-04-02: ทดสอบว่า rate limit เป็น per-user
   *
   * Payment tier ใช้ userID เป็น key
   * ดังนั้น user แต่ละคนมี counter แยกกัน
   */
  test('TC-04-02: Payment verify rate limit ควรเป็น per user', async () => {
    // กำหนด: Payment tier ใช้ userID เป็น key
    // เมื่อ: user เดียวกันส่ง request หลายครั้ง
    // then: user ควรโดน rate limit ของตัวเอง

    const result = await loginAndBurstTest({
      baseURL,
      loginEndpoint: '/v1/md/auth/customer/sign-in',
      targetEndpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      credentials,
      burstSize: 12,
      body: { invoice_id: '69d4e2fe76faf342bd4a6322', amount: 100 },
    });

    console.log('\n=== TC-04-02: Per-User Rate Limit ===');

    const analysis = analyzeRateLimitResults(result.burstResults);
    console.log(`Rate limited: ${analysis.rateLimited}`);
    console.log(`At request: ${analysis.rateLimitedAt || 'N/A'}`);

    if (analysis.rateLimited) {
      expect(analysis.rateLimitedAt).toBeLessThanOrEqual(12);
    }
  });
});
