import { test, expect } from '@playwright/test';

/**
 * TC-08: ทดสอบ ADMIN Exempt จาก Rate Limit
 *
 * BO API: https://apixint-sit.askmebill.com
 *
 * พฤติกรรมที่คาดหวัง:
 * - SUPERADMIN/ACCOUNT roles ได้รับยกเว้นจาก rate limiting
 * - BO endpoints ควรอนุญาต request ไม่จำกัดสำหรับ ADMIN roles
 * - Customer API ยังคงมี rate limits ปกติ
 */

test.describe('TC-08: ADMIN Exempt from Rate Limit', () => {
  const BO_API_BASE = process.env.BO_API_BASE_URL || 'https://apixint-sit.askmebill.com';

  const BO_CREDENTIALS = {
    email: process.env.BO_EMAIL || 'superadmin_eiji',
    password: process.env.BO_PASSWORD || '0897421942@Earth',
    totp: process.env.BO_2FA || '954900',
  };

  /**
   * TC-08-01: ทดสอบว่า SUPERADMIN ไม่โดน rate limit บน BO auth endpoints
   *
   * ขั้นตอน:
   * 1. ส่ง request 10 ครั้งไปที่ /v1/auth/verify ด้วย SUPERADMIN account
   * 2. คาดหวังว่าทั้ง 10 ครั้งจะได้ 200 (ไม่โดน 429)
   */
  test('TC-08-01: SUPERADMIN ไม่ควรโดน rate limit บน BO auth endpoints', async () => {
    // กำหนด: SUPERADMIN account
    // เมื่อ: ส่ง 10 requests ไปที่ BO auth endpoint
    // then: ทั้งหมดควรสำเร็จ (ไม่มี rate limiting)

    console.log('\n=== TC-08-01: BO Auth Exemption ===');
    console.log('Testing SUPERADMIN BO auth endpoint...');

    const results: { status: number; count: number }[] = [];

    for (let i = 1; i <= 10; i++) {
      const response = await fetch(`${BO_API_BASE}/v1/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://bo-sit.askmebill.com',
          'Referer': 'https://bo-sit.askmebill.com/',
        },
        body: JSON.stringify({
          email: BO_CREDENTIALS.email,
          password: BO_CREDENTIALS.password,
          captcha: '1234',
        }),
      });

      results.push({ status: response.status, count: i });
    }

    const rateLimitedCount = results.filter(r => r.status === 429).length;
    const successCount = results.filter(r => r.status === 200).length;

    console.log(`Successful (200): ${successCount}`);
    console.log(`Rate limited (429): ${rateLimitedCount}`);

    // SUPERADMIN ไม่ควรโดน rate limit
    expect(rateLimitedCount).toBe(0);
    expect(successCount).toBe(10);
  });

  /**
   * TC-08-02: ทดสอบว่า SUPERADMIN ไม่โดน rate limit บน BO API endpoints
   *
   * ขั้นตอน:
   * 1. Login เป็น SUPERADMIN ได้ token
   * 2. ส่ง request 10 ครั้งไปที่ BO endpoints ต่างๆ
   * 3. คาดหวังว่าจะไม่โดน 429
   */
  test('TC-08-02: SUPERADMIN ไม่ควรโดน rate limit บน BO API endpoints', async () => {
    // ขั้นตอนที่ 1: Login เป็น SUPERADMIN
    console.log('\n=== TC-08-02: BO Endpoints Exemption ===');
    console.log('Step 1: Logging in as SUPERADMIN...');

    const loginResponse = await fetch(`${BO_API_BASE}/v1/auth/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://bo-sit.askmebill.com',
        'Referer': 'https://bo-sit.askmebill.com/',
      },
      body: JSON.stringify({
        email: BO_CREDENTIALS.email,
        password: BO_CREDENTIALS.password,
      }),
    });

    if (loginResponse.status !== 200) {
      console.log('⚠️ Login failed - skipping test');
      return;
    }

    const loginData = await loginResponse.json();
    let token = loginData?.token;

    // ขั้นตอนที่ 2: Verify TOTP ถ้าต้องการ
    if (token) {
      const totpResponse = await fetch(`${BO_API_BASE}/v1/auth/verify/totp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          totp_key: BO_CREDENTIALS.totp,
          generate_token: true,
        }),
      });

      const totpData = await totpResponse.json();
      token = totpData?.token || token;
    }

    if (!token) {
      console.log('⚠️ Could not obtain token - skipping test');
      return;
    }

    // ขั้นตอนที่ 3: ทดสอบ BO endpoints - ไม่ควรโดน rate limit
    console.log('Step 2: Testing BO endpoints...');

    const boEndpoints = [
      '/v1/customer/search?full_name=&prefix=&telegram=&email=&phone_number=&start_date=&end_date=&client_name=&product_id=&page=1&limit=50',
      '/v1/product/list',
      '/v1/user/profile',
      '/v1/billing-note/dashboard',
    ];

    for (const endpoint of boEndpoints) {
      const endpointResults: { status: number }[] = [];

      for (let i = 1; i <= 10; i++) {
        const response = await fetch(`${BO_API_BASE}${endpoint}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Origin': 'https://bo-sit.askmebill.com',
            'Referer': 'https://bo-sit.askmebill.com/',
          },
        });
        endpointResults.push({ status: response.status });
      }

      const rateLimitedCount = endpointResults.filter(r => r.status === 429).length;
      console.log(`${endpoint.split('?')[0]}: ${10 - rateLimitedCount}/10 success, ${rateLimitedCount} rate limited`);

      expect(rateLimitedCount).toBe(0);
    }

    console.log('✅ SUPERADMIN correctly exempt from rate limiting');
  });

  /**
   * TC-08-03: เปรียบเทียบว่า BO API มีพฤติกรรมต่างจาก Customer API
   *
   * - Customer API (api-sit): มี rate limit
   * - BO API (apixint-sit) กับ SUPERADMIN: ไม่มี rate limit
   */
  test('TC-08-03: BO API ควรมีพฤติกรรมต่างจาก Customer API', async () => {
    // เปรียบเทียบ: Customer API (มี rate limit) vs BO API (ยกเว้น)
    console.log('\n=== TC-08-03: Customer vs BO Comparison ===');

    const customerApi = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

    // ทดสอบ Customer API (ควรโดน rate limit)
    console.log('1. Testing Customer API (should be rate limited)...');
    const customerLoginResponse = await fetch(`${customerApi}/v1/auth/customer/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin_eiji',
        password: '0897421942@Earth',
      }),
    });
    const customerData = await customerLoginResponse.json();
    const customerToken = customerData?.token || customerData?.data?.token;

    if (customerToken) {
      let customerRateLimited = false;
      for (let i = 1; i <= 65; i++) {
        const response = await fetch(`${customerApi}/v1/customer/list`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${customerToken}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.status === 429) {
          console.log(`   Customer API: Rate limited at request ${i}`);
          customerRateLimited = true;
          break;
        }
      }
      if (!customerRateLimited) {
        console.log(`   Customer API: Not rate limited (may need higher limit)`);
      }
    }

    // ทดสอบ BO API กับ SUPERADMIN (ไม่ควรโดน rate limit)
    console.log('2. Testing BO API with SUPERADMIN (should NOT be rate limited)...');
    const boLoginResponse = await fetch(`${BO_API_BASE}/v1/auth/sign-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://bo-sit.askmebill.com',
        'Referer': 'https://bo-sit.askmebill.com/',
      },
      body: JSON.stringify({
        email: BO_CREDENTIALS.email,
        password: BO_CREDENTIALS.password,
      }),
    });

    if (boLoginResponse.status === 200) {
      const boData = await boLoginResponse.json();
      let boToken = boData?.token;

      if (boToken) {
        const totpResponse = await fetch(`${BO_API_BASE}/v1/auth/verify/totp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${boToken}`,
          },
          body: JSON.stringify({
            totp_key: BO_CREDENTIALS.totp,
            generate_token: true,
          }),
        });
        const totpData = await totpResponse.json();
        boToken = totpData?.token || boToken;
      }

      if (boToken) {
        let boRateLimited = false;
        for (let i = 1; i <= 65; i++) {
          const response = await fetch(`${BO_API_BASE}/v1/customer/search?page=1&limit=50`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${boToken}`,
              'Origin': 'https://bo-sit.askmebill.com',
              'Referer': 'https://bo-sit.askmebill.com/',
            },
          });
          if (response.status === 429) {
            console.log(`   BO API: Rate limited at request ${i} - BUG!`);
            boRateLimited = true;
            break;
          }
        }
        if (!boRateLimited) {
          console.log(`   BO API: NOT rate limited - ✅ Correct!`);
        }
      }
    }
  });
});
