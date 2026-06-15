import { test, expect } from '@playwright/test';
import {
  burstTest,
  analyzeRateLimitResults,
  getFreshToken,
  clearRateLimitForUser,
} from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

/**
 * TC-10: ClearRateLimit Correctness (เพิ่มสำหรับ ACC-1427 — Redis migration)
 *
 * ทำไมต้องมี:
 * หลัง migrate MongoDB -> Redis (ACC-1429) ฟังก์ชัน ClearRateLimit เปลี่ยนเป็น
 *   SCAN pattern "rl:{env}:*{userId}*" (และ "*{ip}*") + DEL
 * pattern แบบ substring สองข้างเสี่ยง "over-match" เช่น clear "eiji" อาจไป
 * ลบ key ของ "eiji2" ด้วย (เพราะ eiji ⊂ eiji2)
 *
 * suite เดิมใช้ clearRateLimitForUser() เป็นแค่ "setup" ไม่เคย *ยืนยัน* ว่า:
 *   1) clear แล้วปลด block ได้จริง
 *   2) clear แยกราย user ได้จริง (ไม่ over-match)
 *
 * Tier ที่ใช้: payment (10 req/min, key = userID, เคลียร์ได้) — เลขชัดเจน
 * ไม่ติดประเด็น 5-vs-10 ของ strict tier (sign-in)
 *
 * หมายเหตุ: เทสต์นี้แตะ rate-limit state ของ SIT users ที่ใช้ร่วมกับ TC-04/05/06
 * จึงตั้ง mode 'serial' และแนะนำให้รันแยก (`npx playwright test tc10`)
 * เพื่อเลี่ยงการรบกวนกันบน live SIT
 */

const baseURL = getApiBaseUrl();

// invoice fixture เดียวกับ TC-04/TC-05 — rate limit middleware นับ "ก่อน" handler
// ดังนั้น invoice ผิด (400) ก็ยังนับเข้า limit ตามปกติ
const TEST_INVOICE_ID = '69e6760f466b99885541692c';
const PAYMENT_ENDPOINT = '/v1/md/billing-note/payment/verify';
const PAYMENT_LIMIT = 10; // payment tier = 10 req/min (ACC-1138)

const userA = {
  email: process.env.AUTH_EMAIL || 'eiji',
  password: process.env.AUTH_PASSWORD || '',
  totp: process.env.AUTH_2FA || '',
};

// userB: ตั้งใจเลือกชื่อที่ userA เป็น substring (eiji ⊂ eiji2)
// เพื่อ probe over-match ของ SCAN pattern "*{userId}*" โดยเฉพาะ
const userB = {
  email: process.env.AUTH_EMAIL_C || 'eiji2',
  password: process.env.AUTH_PASSWORD_C || '',
  totp: process.env.AUTH_2FA || '',
};

function paymentBurst(token: string, size: number) {
  return burstTest({
    baseURL,
    endpoint: PAYMENT_ENDPOINT,
    method: 'POST',
    token,
    burstSize: size,
    body: { invoice_id: TEST_INVOICE_ID, amount: 100 },
  });
}

// ทุกเทสต์ในไฟล์นี้แตะ state ร่วมกัน + ไวต่อ window 60s → รันแบบ serial
test.describe.configure({ mode: 'serial' });

test.describe('TC-10: ClearRateLimit Correctness (Redis migration / ACC-1427)', () => {
  test.setTimeout(180000);

  test('TC-10-01: clear แล้ว user ที่เคยโดน block ต้องยิงได้อีก', async () => {
    const token = await getFreshToken(userA.email, userA.password, userA.totp);
    test.skip(!token, `ไม่ได้ token ของ ${userA.email} — ทดสอบ clear ไม่ได้`);

    console.log('\n=== TC-10-01: Clear ปลด block ได้จริง ===');

    // baseline สะอาด
    await clearRateLimitForUser(userA.email);

    // 1) ทำให้โดน rate limit (burst เกิน limit)
    const blocked = analyzeRateLimitResults(await paymentBurst(token!, PAYMENT_LIMIT + 5));
    console.log(`ก่อน clear: rateLimited=${blocked.rateLimited} at #${blocked.rateLimitedAt}`);
    expect(blocked.rateLimited, 'payment tier ต้อง rate limit ได้ก่อน clear').toBe(true);

    // 2) clear
    await clearRateLimitForUser(userA.email);
    await new Promise((r) => setTimeout(r, 2000));

    // 3) ยิงใหม่ไม่กี่ครั้ง (<< limit) ต้องไม่เจอ 429 อีก
    const afterClear = await paymentBurst(token!, 3);
    const got429 = afterClear.filter((r) => r.statusCode === 429).length;
    console.log(`หลัง clear: 429 count = ${got429} (codes: ${afterClear.map((r) => r.statusCode)})`);
    expect(got429, 'หลัง clear ไม่ควรเจอ 429 อีก (counter ถูก reset)').toBe(0);
  });

  test('TC-10-02: clear user A ต้องไม่ปลด block user B (กัน over-match)', async () => {
    const tokenA = await getFreshToken(userA.email, userA.password, userA.totp);
    const tokenB = await getFreshToken(userB.email, userB.password, userB.totp);
    test.skip(!tokenA || !tokenB, `ต้องมี token ทั้ง ${userA.email} และ ${userB.email}`);

    console.log('\n=== TC-10-02: Clear isolation (over-match guard) ===');

    // baseline สะอาดทั้งคู่
    await clearRateLimitForUser(userA.email);
    await clearRateLimitForUser(userB.email);

    // block ทั้ง A และ B
    const aBlocked = analyzeRateLimitResults(await paymentBurst(tokenA!, PAYMENT_LIMIT + 5));
    const bBlocked = analyzeRateLimitResults(await paymentBurst(tokenB!, PAYMENT_LIMIT + 5));
    expect(aBlocked.rateLimited, 'User A ต้องโดน block ก่อน').toBe(true);
    expect(bBlocked.rateLimited, 'User B ต้องโดน block ก่อน').toBe(true);

    // clear เฉพาะ A
    await clearRateLimitForUser(userA.email);
    await new Promise((r) => setTimeout(r, 1000));

    // เช็ค B ก่อน — ให้เร็วที่สุดก่อน window 60s ของ B reset เอง (ลด flaky)
    const bAfter = await paymentBurst(tokenB!, 3);
    const bStillBlocked = bAfter.some((r) => r.statusCode === 429);

    // แล้วค่อยเช็ค A ว่าหลุด block
    const aAfter = await paymentBurst(tokenA!, 3);
    const aGot429 = aAfter.filter((r) => r.statusCode === 429).length;

    console.log(`A หลัง clear: 429=${aGot429} | B (ไม่ได้ clear): stillBlocked=${bStillBlocked}`);

    expect(aGot429, 'User A ต้องถูกปลด block หลัง clear').toBe(0);
    expect(
      bStillBlocked,
      'User B ต้องยังโดน block — ถ้า B หลุดด้วย แปลว่า clear A ไป over-match key ของ B (eiji ⊂ eiji2)',
    ).toBe(true);
  });
});
