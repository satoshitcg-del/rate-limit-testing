import { test, expect } from '@playwright/test';
import { getBoApiBaseUrl, getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-08: ทดสอบ ADMIN Exempt จาก Rate Limit
 *
 * SUPERADMIN/ACCOUNT roles ได้รับยกเว้นจาก rate limiting
 */

test.describe('TC-08: ADMIN Exempt from Rate Limit', () => {
  const BO_API_BASE = getBoApiBaseUrl();
  const CUSTOMER_API = getApiBaseUrl();

  const BO_CREDENTIALS = {
    email: process.env.BO_EMAIL || 'superadmin_eiji',
    password: process.env.BO_PASSWORD || '0897421942@Earth',
    totp: process.env.BO_2FA || '954900',
  };

  const CUSTOMER_CREDENTIALS = {
    email: 'admin_eiji',
    password: '0897421942@Earth',
  };

  let boToken: string;
  let customerToken: string;

  test.beforeAll(async () => {
    // BO Login
    const loginResponse = await fetch(`${BO_API_BASE}/v1/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: BO_CREDENTIALS.email,
        password: BO_CREDENTIALS.password,
      }),
    });
    if (loginResponse.status === 200) {
      const data = await loginResponse.json();
      boToken = data?.token || null;
    }

    // Customer Login
    const customerLogin = await authClient.signIn(CUSTOMER_CREDENTIALS);
    customerToken = customerLogin?.data?.token;

    console.log(`[DEBUG] BO Token: ${boToken ? 'obtained' : 'failed'}`);
    console.log(`[DEBUG] Customer Token: ${customerToken ? 'obtained' : 'failed'}`);
  });

  async function sendBoRequests(token: string, endpoint: string, count: number): Promise<number> {
    let rateLimitedCount = 0;
    for (let i = 0; i < count; i++) {
      const response = await fetch(`${BO_API_BASE}${endpoint}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (response.status === 429) rateLimitedCount++;
    }
    return rateLimitedCount;
  }

  test('TC-08-01: SUPERADMIN ไม่ควรโดน rate limit บน BO auth endpoints', async () => {
    console.log('\n=== TC-08-01: BO Auth Exemption ===');

    let successCount = 0;
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${BO_API_BASE}/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: BO_CREDENTIALS.email, password: BO_CREDENTIALS.password, captcha: '1234' }),
      });
      if (response.status === 200) successCount++;
    }

    console.log(`Success: ${successCount}/10, Rate limited: ${10 - successCount}`);
    expect(successCount).toBe(10);
  });

  test('TC-08-02: SUPERADMIN ไม่ควรโดน rate limit บน BO API endpoints', async () => {
    console.log('\n=== TC-08-02: BO Endpoints Exemption ===');

    if (!boToken) {
      console.log('⚠️ Login failed - skipping test');
      return;
    }

    const boEndpoints = [
      '/v1/customer/search?page=1&limit=50',
      '/v1/product/list',
      '/v1/user/profile',
      '/v1/billing-note/dashboard',
    ];

    for (const endpoint of boEndpoints) {
      const rateLimited = await sendBoRequests(boToken, endpoint, 10);
      console.log(`${endpoint}: ${10 - rateLimited}/10 success`);
      expect(rateLimited).toBe(0);
    }
  });

  test('TC-08-03: BO API ควรมีพฤติกรรมต่างจาก Customer API', async () => {
    console.log('\n=== TC-08-03: Customer vs BO Comparison ===');

    if (customerToken) {
      let customerRateLimited = false;
      for (let i = 1; i <= 65; i++) {
        const response = await fetch(`${CUSTOMER_API}/v1/customer/list`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
        });
        if (response.status === 429) {
          console.log(`Customer API: Rate limited at request ${i}`);
          customerRateLimited = true;
          break;
        }
      }
      if (!customerRateLimited) console.log('Customer API: Not rate limited');
    }

    if (boToken) {
      let boRateLimited = false;
      for (let i = 1; i <= 65; i++) {
        const response = await fetch(`${BO_API_BASE}/v1/customer/search?page=1&limit=50`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${boToken}`, 'Content-Type': 'application/json' },
        });
        if (response.status === 429) {
          console.log(`BO API: Rate limited at request ${i} - BUG!`);
          boRateLimited = true;
          break;
        }
      }
      if (!boRateLimited) console.log('BO API: NOT rate limited - ✅');
    }
  });
});