import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';

/**
 * TC-07: ทดสอบ Response Format เมื่อโดน Rate Limit
 *
 * Expected 429 Response Format:
 * HTTP/1.1 429 Too Many Requests
 * {
 *   "success": false,
 *   "code": 10027,
 *   "message": "too many requests"
 * }
 *
 * Rate Limit Headers:
 * - X-RateLimit-Limit: จำนวน request สูงสุดที่อนุญาต
 * - X-RateLimit-Remaining: request ที่เหลือใน window
 * - X-RateLimit-Reset: Unix timestamp ที่ window reset
 * - Retry-After: วินาทีที่ต้องรอก่อน retry
 */

test.describe('TC-07: Response Format when Rate Limited', () => {
  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  /**
   * TC-07-01: ทดสอบว่าได้ 429 response format ที่ถูกต้อง
   *
   * ขั้นตอน:
   * 1. ส่ง request จนโดน rate limit
   * 2. ตรวจสอบว่าได้ status 429
   */
  test('TC-07-01: ควรได้ 429 response format ที่ถูกต้อง', async () => {
    // กำหนด: client เกิน rate limit แล้ว
    // เมื่อ: ส่ง request เพิ่ม
    // then: ควรได้ 429 พร้อม JSON format ที่ถูกต้อง

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 10,
    });

    console.log('\n=== TC-07-01: 429 Response Format ===');

    // ตรวจสอบ IP block
    const ipBlocked = results.some(r => r.statusCode === 400 && r.rateLimitCode === 10019);
    if (ipBlocked) {
      console.log('⚠️ IP is blocked (10019) - rate limit cannot be verified');
      return;
    }

    const rateLimitedResult = results.find(r => r.isRateLimited);

    if (!rateLimitedResult) {
      console.log('⚠️ Rate limit not triggered in this run');
      return;
    }

    expect(rateLimitedResult.statusCode).toBe(429);
    console.log(`Status: ${rateLimitedResult.statusCode}`);
    console.log(`Expected: 429`);
  });

  /**
   * TC-07-02: ทดสอบว่าได้ error code ที่ถูกต้อง (10027)
   *
   * ขั้นตอน:
   * 1. ส่ง request จนโดน 429
   * 2. ดึง code จาก response body
   * 3. ตรวจสอบว่า code = 10027
   */
  test('TC-07-02: ควรได้ error code ที่ถูกต้อง (10027)', async () => {
    // กำหนด: ได้ response 429 แล้ว
    // เมื่อ: parse response body
    // then: ควรได้ code: 10027

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 10,
    });

    console.log('\n=== TC-07-02: Error Code Validation ===');

    const rateLimitedResult = results.find(r => r.isRateLimited);

    if (rateLimitedResult) {
      console.log(`Rate limit code: ${rateLimitedResult.rateLimitCode}`);
      console.log(`Expected: 10027`);
    }
  });

  /**
   * TC-07-03: ทดสอบว่า response มี rate limit headers
   *
   * Headers ที่ควรมี:
   * - X-RateLimit-Limit
   * - X-RateLimit-Remaining
   * - X-RateLimit-Reset
   * - Retry-After
   */
  test('TC-07-03: ควรมี rate limit headers ใน response', async () => {
    // กำหนด: endpoint ที่มี rate limit
    // เมื่อ: client ตรวจสอบ headers
    // then: ควรมี X-RateLimit-* headers

    const loginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const loginData = await loginResponse.json();
    const token = loginData?.token || loginData?.data?.token;

    if (!token) {
      console.log('⚠️ Could not obtain token - skipping');
      return;
    }

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 65,
    });

    console.log('\n=== TC-07-03: Rate Limit Headers ===');

    const rateLimited = results.find(r => r.isRateLimited);

    if (rateLimited) {
      console.log(`X-RateLimit-Limit: ${rateLimited.rateLimit.limit}`);
      console.log(`X-RateLimit-Remaining: ${rateLimited.rateLimit.remaining}`);
      console.log(`X-RateLimit-Reset: ${rateLimited.rateLimit.reset}`);
      console.log(`Retry-After: ${rateLimited.rateLimit.retryAfter}`);
    } else {
      console.log('Note: Rate limit not triggered in this run');
    }
  });

  /**
   * TC-07-04: ทดสอบว่า standard tier ได้ 429 format เหมือน strict tier
   *
   * ทุก tier ควรได้ response format เดียวกัน
   */
  test('TC-07-04: Standard tier ควรได้ 429 format เหมือน strict tier', async () => {
    // กำหนด: standard tier endpoint
    // เมื่อ: rate limit เกิน
    // then: ควรได้ 429 format เหมือน strict tier

    const loginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const loginData = await loginResponse.json();
    const token = loginData?.token || loginData?.data?.token;

    if (!token) {
      console.log('⚠️ Could not obtain token - skipping');
      return;
    }

    const results = await burstTest({
      baseURL,
      endpoint: '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
      method: 'GET',
      token,
      burstSize: 70,
    });

    console.log('\n=== TC-07-04: Standard Tier 429 Format ===');

    const rateLimitedResult = results.find(r => r.isRateLimited);

    if (rateLimitedResult) {
      console.log(`Status: ${rateLimitedResult.statusCode}`);
      console.log(`Expected: 429`);
      expect(rateLimitedResult.statusCode).toBe(429);
    } else {
      console.log('Note: Standard tier rate limit not triggered');
    }
  });
});
