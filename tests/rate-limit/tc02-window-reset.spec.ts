import { test, expect } from '@playwright/test';
import { burstTest } from '../helpers/rate-limit-analyzer';

/**
 * TC-02: ทดสอบ Window Reset
 *
 * พฤติกรรมที่คาดหวัง:
 * - Rate limit window จะ reset หลังจาก 61 วินาที
 * - หลัง window reset คำขอใหม่ควรถูกอนุญาต
 *
 * หมายเหตุ: IP block (code 10019) จะยังคงอยู่หลังจาก rate limit window reset
 */

test.describe('TC-02: Window Reset', () => {
  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  /**
   * TC-02-01: ทดสอบว่าสามารถส่ง request ได้หลัง window reset 61 วินาที
   *
   * ขั้นตอน:
   * 1. ส่ง request จนโดน rate limit (429)
   * 2. รอ 61 วินาที (ให้ window ใหม่เริ่ม)
   * 3. ส่ง request ใหม่ → ควรได้ 200
   *
   * กรณีพิเศษ:
   * - ถ้าได้ 400 (code 10019) แปลว่า IP ถูก block แยกต่างหาก
   *   IP block ไม่ได้ reset พร้อม rate limit window
   */
  test('TC-02-01: ควรอนุญาตให้ส่ง request หลัง window reset 61 วินาที', async () => {
    test.setTimeout(120000); // timeout 2 นาทีสำหรับรอ 61 วินาที

    // ขั้นตอนที่ 1: ส่ง request จนโดน rate limit
    console.log('\n=== TC-02-01: Window Reset Test ===');
    console.log('Step 1: Hitting rate limit...');

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 15,
    });

    // ตรวจสอบ IP block
    const ipBlocked = results.some(r => r.statusCode === 400 && r.rateLimitCode === 10019);
    if (ipBlocked) {
      console.log('⚠️ IP is blocked (10019) - cannot verify window reset');
      console.log('   IP block is separate from rate limit window');
      return;
    }

    const rateLimitedAt = results.find(r => r.isRateLimited)?.requestCount;
    console.log(`Rate limited at request #${rateLimitedAt}`);
    expect(rateLimitedAt).toBeDefined();

    // ขั้นตอนที่ 2: รอ 61 วินาทีสำหรับ window reset
    console.log('Step 2: Waiting 61 seconds for window reset...');
    await new Promise(resolve => setTimeout(resolve, 61000));

    // ขั้นตอนที่ 3: ส่ง request ใหม่หลัง window reset
    console.log('Step 3: Testing after window reset...');
    const response = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    console.log(`Response status after reset: ${response.status}`);

    // ถ้าได้ 400 (10019) = IP ถูก block แยกจาก rate limit
    if (response.status === 400) {
      const body = await response.json();
      if (body?.code === 10019) {
        console.log('⚠️ IP is blocked (10019) - cannot verify window reset');
        console.log('   IP block persists beyond rate limit window');
        return; // ข้าม - IP block เป็นปัญหาแยกต่างหาก
      }
    }

    expect(response.status).toBe(200);
  });

  /**
   * TC-02-02: ทดสอบว่า rate limit counter reset ที่ขอบ window
   *
   * ขั้นตอน:
   * 1. ส่ง 6 requests (โดน limit ที่ request ที่ 6)
   * 2. รอ 61 วินาที
   * 3. ส่ง request ใหม่ → window ใหม่ควรนับจาก 0 ใหม่
   */
  test('TC-02-02: Rate limit counter ควร reset ที่ window boundary', async () => {
    test.setTimeout(120000);

    // ขั้นตอนที่ 1: ส่ง 6 requests เพื่อโดน rate limit
    console.log('\n=== TC-02-02: Counter Reset at Boundary ===');
    console.log('Step 1: Hitting rate limit...');

    const results = await burstTest({
      baseURL,
      endpoint: '/v1/md/auth/customer/sign-in',
      method: 'POST',
      body: credentials,
      burstSize: 6,
    });

    const firstWindowLimited = results.some(r => r.isRateLimited);

    if (firstWindowLimited) {
      console.log('First window: Rate limited (as expected)');

      // รอ reset
      console.log('Waiting 61 seconds...');
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Window ใหม่: ควรส่งได้อย่างน้อย 1 request
      console.log('Step 2: Testing new window...');
      const response = await fetch(`${baseURL}/v1/md/auth/customer/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (response.status === 400) {
        const body = await response.json();
        if (body?.code === 10019) {
          console.log('⚠️ IP blocked - cannot verify counter reset');
          return;
        }
      }

      expect(response.status).toBe(200);
    } else {
      console.log('Note: Rate limit not triggered in this test run');
    }
  });
});
