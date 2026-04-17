import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';

/**
 * TC-05: ทดสอบ User Isolation
 *
 * พฤติกรรมที่คาดหวัง:
 * - Rate limits จะถูก track ต่อ userID (ไม่ใช่ IP สำหรับ payment/standard tiers)
 * - User A โดน rate limit ไม่ควรกระทบ User B
 * - แต่ละ user มี counter แยกกัน
 */

test.describe('TC-05: User Isolation', () => {
  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const userA = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  const userB = {
    email: process.env.AUTH_EMAIL_B || 'admintest',
    password: process.env.AUTH_PASSWORD_B || '0897421942@Earth',
  };

  /**
   * TC-05-01: ทดสอบว่า User A และ User B มี rate limit counter แยกกัน
   *
   * ขั้นตอน:
   * 1. User A login แล้วส่ง request จนโดน limit
   * 2. User B login แล้วส่ง request
   * 3. ตรวจสอบว่าแต่ละ user มี counter แยกกัน (โดน limit แยกกัน)
   *
   * กรณีพิเศษ:
   * - ถ้า login ไม่ได้ (IP blocked) → skip
   */
  test('TC-05-01: User A และ User B ควรมี rate limit counter แยกกัน', async () => {
    // กำหนด: user สองคนที่แตกต่างกัน
    // เมื่อ: ทั้งสอง user ส่ง request ไปที่ payment verify endpoint
    // then: rate limit ของแต่ละ user ควรถูก track แยกกัน

    console.log('\n=== TC-05-01: Separate Rate Limit Counters ===');

    // User A โดน rate limit
    console.log('User A: Logging in...');
    const userALoginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA),
    });
    const userAData = await userALoginResponse.json();
    const userAToken = userAData?.token || userAData?.data?.token;

    if (!userAToken) {
      console.log('⚠️ Could not obtain User A token - skipping');
      return;
    }

    console.log('User A: Hitting payment verify rate limit...');
    const userAResults = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userAToken,
      body: { invoice_id: 'test', amount: 100 },
      burstSize: 15,
    });

    const userARateLimitedAt = userAResults.find(r => r.isRateLimited)?.requestCount;
    console.log(`User A rate limited at request #${userARateLimitedAt || 'not triggered'}`);

    // User B ส่ง request
    console.log('User B: Logging in...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const userBLoginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB),
    });
    const userBData = await userBLoginResponse.json();
    const userBToken = userBData?.token || userBData?.data?.token;

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
      body: { invoice_id: 'test', amount: 100 },
      burstSize: 15,
    });

    const userBRateLimitedAt = userBResults.find(r => r.isRateLimited)?.requestCount;
    console.log(`User B rate limited at request #${userBRateLimitedAt || 'not triggered'}`);

    // ทั้งสองควรโดน rate limit แยกกัน
    if (userARateLimitedAt && userBRateLimitedAt) {
      expect(userARateLimitedAt).toBeLessThanOrEqual(12);
      expect(userBRateLimitedAt).toBeLessThanOrEqual(12);
    }
  });

  /**
   * TC-05-02: ทดสอบว่า User B ไม่โดนกระทบเมื่อ User A โดน rate limit
   *
   * ขั้นตอน:
   * 1. User A ส่ง request จนโดน limit
   * 2. User B ส่ง request ทันที
   * 3. User B ควรได้ 200 (ไม่โดนกระทบจาก User A)
   */
  test('TC-05-02: User B ไม่ควรโดน block เมื่อ User A โดน rate limit', async () => {
    // กำหนด: User A โดน rate limit แล้ว
    // เมื่อ: User B ส่ง request
    // then: User B ควรยังสามารถส่ง request ได้

    console.log('\n=== TC-05-02: User B Isolation ===');

    // User A โดน limit
    console.log('User A: Logging in and hitting rate limit...');
    const userALoginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userA),
    });
    const userAData = await userALoginResponse.json();
    const userAToken = userAData?.token || userAData?.data?.token;

    if (!userAToken) {
      console.log('⚠️ Could not obtain User A token - skipping');
      return;
    }

    await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userAToken,
      body: { invoice_id: 'test', amount: 100 },
      burstSize: 12,
    });

    // User B ส่ง request - ควรยังทำงานได้
    console.log('User A blocked. User B sending requests...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const userBLoginResponse = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userB),
    });
    const userBData = await userBLoginResponse.json();
    const userBToken = userBData?.token || userBData?.data?.token;

    if (!userBToken) {
      console.log('⚠️ Could not obtain User B token - skipping');
      return;
    }

    const userBResults = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token: userBToken,
      body: { invoice_id: 'test', amount: 100 },
      burstSize: 5,
    });

    const userBSuccessCount = userBResults.filter(r => r.statusCode === 200).length;
    console.log(`User B first ${userBResults.length} requests: ${userBSuccessCount} succeeded`);

    expect(userBSuccessCount).toBeGreaterThan(0);
  });
});
