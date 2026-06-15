import { test, expect } from '@playwright/test';
import { getBoApiBaseUrl } from '../../config/env';

/**
 * TC-08: ADMIN Exempt from Rate Limit
 *
 * SUPERADMIN/ACCOUNT roles are exempt from rate limiting (ACC-1138). One assertion
 * carries this: burst several BO API endpoints past any tier limit and expect zero 429s.
 *
 * (Dropped: the "BO auth verify" test used a fake captcha so it never returned 200 —
 * it asserted a request-validity artifact, not exemption. The customer-vs-BO compare
 * never asserted the customer side. Both were noise.)
 */

test.describe('TC-08: ADMIN Exempt from Rate Limit', () => {
  const BO_API_BASE = getBoApiBaseUrl();

  const BO_CREDENTIALS = {
    email: process.env.BO_EMAIL || 'superadmin_eiji',
    password: process.env.BO_PASSWORD || '',
  };

  let boToken: string;

  test.beforeAll(async () => {
    const loginResponse = await fetch(`${BO_API_BASE}/v1/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: BO_CREDENTIALS.email, password: BO_CREDENTIALS.password }),
    });
    if (loginResponse.status === 200) {
      const data = (await loginResponse.json()) as any;
      boToken = data?.token || null;
    }
    console.log(`[DEBUG] BO Token: ${boToken ? 'obtained' : 'failed'}`);
  });

  async function sendBoRequests(token: string, endpoint: string, count: number): Promise<number> {
    let rateLimitedCount = 0;
    for (let i = 0; i < count; i++) {
      const response = await fetch(`${BO_API_BASE}${endpoint}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (response.status === 429) rateLimitedCount++;
    }
    return rateLimitedCount;
  }

  test('TC-08-02: SUPERADMIN ไม่ควรโดน rate limit บน BO API endpoints', async () => {
    console.log('\n=== TC-08-02: BO Endpoints Exemption ===');
    test.skip(!boToken, 'ไม่ได้ BO token — ข้ามการตรวจ exempt (ไม่ใช่ pass)');

    const boEndpoints = [
      '/v1/customer/search?page=1&limit=50',
      '/v1/product/list',
      '/v1/user/profile',
      '/v1/billing-note/dashboard',
    ];

    for (const endpoint of boEndpoints) {
      const rateLimited = await sendBoRequests(boToken, endpoint, 10);
      console.log(`${endpoint}: ${10 - rateLimited}/10 success`);
      expect(rateLimited, `SUPERADMIN ต้องได้รับยกเว้น (ACC-1138) — ${endpoint}`).toBe(0);
    }
  });
});
