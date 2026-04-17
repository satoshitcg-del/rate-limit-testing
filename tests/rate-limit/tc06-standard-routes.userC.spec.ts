import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';

/**
 * TC-06: Standard Routes Rate Limit - User C (Endpoints 1-3)
 */

test.describe('TC-06: Standard Routes Rate Limit - User C (1-3)', () => {
  test.setTimeout(300000);

  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';

  const credentials = {
    email: process.env.AUTH_EMAIL_C || 'eiji2',
    password: process.env.AUTH_PASSWORD_C || '0897421942@Earth',
  };

  const endpoints = [
    '/v1/md/user/profile',
    '/v1/md/customer/sub-accounts?page=1&limit=25',
    '/v1/md/billing-note/customer-export-all/PENDING',
  ];

  for (const endpoint of endpoints) {
    test(`TC-06: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);
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
      const otherEndpoint = '/v1/md/customer/sub-accounts?page=1&limit=25';
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
      console.log(`Other endpoint (${otherEndpoint}): ${otherHas429 ? '✅ 429 returned (shared counter)' : '❌ All 200'}`);

      console.log(`1. Works before: ${canHitBefore ? '✅' : '❌'}`);
      console.log(`2. Has rate limit: ${analysis.rateLimited ? '✅' : '❌'}`);
      console.log(`3. Same blocked: ${!canHitAfter ? '✅' : '❌'}`);
      console.log(`4. Other blocked (shared): ${otherHas429 ? '✅' : '❌'}`);

      expect(canHitBefore).toBe(true);
      expect(analysis.rateLimited).toBe(true);
      expect(otherHas429).toBe(true);
    });
  }
});
