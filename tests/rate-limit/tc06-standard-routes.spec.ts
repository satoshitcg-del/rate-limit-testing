import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';

/**
 * TC-06: Standard Routes Rate Limit - ALL Endpoints
 *
 * Tier: Standard (60 ครั้ง/นาที)
 * Key: userID (fallback เป็น IP)
 *
 * ทดสอบทุก endpoints ว่ามี rate limit ตาม spec หรือไม่
 */

test.describe('TC-06: Standard Routes Rate Limit (All Endpoints)', () => {
  test.setTimeout(600000); // 10 min for all tests

  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  const endpoints = [
    // v1 endpoints
    '/v1/md/user/profile',
    '/v1/md/customer/sub-accounts?page=1&limit=25',
    '/v1/md/billing-note/customer-export-all/PENDING',
    '/v1/md/billing-note/customer-export-all/ALL',
    '/v1/md/billing-note/customer-export-all/UNPAID',
    '/v1/md/billing-note/customer?status=UNPAID',
    '/v1/md/billing-note/customer?status=PAID&page=1&limit=25',
    '/v1/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
    '/v1/md/billing-note/customer-export/69d4e2fe76faf342bd4a6322',
    '/v1/md/billing-note/preview/69d4e2fe76faf342bd4a6322',
    '/v1/md/billing-note/customer/invoice/69d4e2fe76faf342bd4a6322',
    '/v1/md/system-file/invoice/slip',
    // v2 endpoints
    '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
    '/v2/md/billing-note/customer?status=PAID&page=1&limit=25',
    '/v2/md/billing-note/customer?status=EXCEED&page=1&limit=25',
    '/v2/md/billing-note/customer?status=REFUND&page=1&limit=25',
    '/v2/md/billing-note/customer?status=VOID&page=1&limit=25',
    '/v2/md/billing-note/customer?status=&page=1&limit=25',
  ];

  for (const endpoint of endpoints) {
    test(`TC-06: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);

      // Wait 65s before each test for rate limit window reset
      console.log('=== Waiting 65 seconds for rate limit window to reset ===');
      await new Promise(resolve => setTimeout(resolve, 65000));

      // Step 1: Verify endpoint works before rate limit
      const initialResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 5,
      });

      const canHitBefore = initialResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Can hit before: ${canHitBefore ? '✅' : '❌'}`);

      // Step 2: Burst to trigger rate limit
      const burstResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 100,
      });

      const analysis = analyzeRateLimitResults(burstResult.burstResults);

      console.log(`Rate limited: ${analysis.rateLimited ? '✅ YES' : '❌ NO'}`);
      console.log(`Rate limited at: ${analysis.rateLimitedAt || 'N/A'}`);
      console.log(`Total requests: ${analysis.totalRequests}`);

      // Step 3: After rate limit, can hit SAME endpoint?
      const sameEndpointResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 3,
      });

      const canHitAfter = sameEndpointResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Same blocked: ${!canHitAfter ? '✅' : '❌'}`);

      // Step 3b: After rate limit, can hit OTHER endpoint?
      // Use a different endpoint that has rate limit to verify SHARED counter
      const otherEndpoint = '/v1/md/billing-note/customer?status=PAID&page=1&limit=25';
      const otherEndpointResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: otherEndpoint,
        method: 'GET',
        credentials,
        burstSize: 3,
      });

      const otherStatusCodes = otherEndpointResult.burstResults.map(r => r.statusCode);
      const otherHas429 = otherStatusCodes.some(s => s === 429);
      const otherAll200 = otherStatusCodes.every(s => s === 200);
      console.log(`Other endpoint (${otherEndpoint}): ${otherHas429 ? '✅ 429 returned (shared counter working)' : otherAll200 ? '❌ All 200 (BUG - counter not shared or other endpoint missing rate limit)' : '⚠️ Mixed'}`);

      // Summary
      console.log('\n========== SUMMARY ==========');
      console.log(`1. Works before rate limit: ${canHitBefore ? '✅' : '❌'}`);
      console.log(`2. Has rate limit: ${analysis.rateLimited ? '✅' : '❌'}`);
      console.log(`3. Same endpoint blocked: ${!canHitAfter ? '✅' : '❌'}`);
      console.log(`4. Other endpoint blocked (shared counter): ${otherHas429 ? '✅' : '❌'}`);

      // ASSERTIONS
      // Endpoint should work before rate limit
      expect(canHitBefore, `Endpoint should work before rate limit: ${endpoint}`).toBe(true);

      // Endpoint MUST have rate limit (60 req/min)
      expect(analysis.rateLimited, `Endpoint MUST have rate limit (60 req/min): ${endpoint}`).toBe(true);

      // OTHER endpoint should also be blocked (shared counter)
      expect(otherHas429, `Other endpoint should be blocked (shared counter): ${endpoint} vs ${otherEndpoint}`).toBe(true);
    });
  }
});
