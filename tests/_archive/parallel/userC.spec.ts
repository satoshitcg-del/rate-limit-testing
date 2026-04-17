import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../../helpers/rate-limit-analyzer';

/**
 * Rate Limit Test - User C (Endpoints 1-6)
 */

test.describe('Rate Limit Test - User C (1-6)', () => {
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
    '/v1/md/billing-note/customer-export-all/ALL',
    '/v1/md/billing-note/customer-export-all/UNPAID',
    '/v1/md/billing-note/customer?status=UNPAID',
  ];

  for (const endpoint of endpoints) {
    test(`RATE LIMIT: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);
      console.log('=== Waiting 65 seconds for rate limit window to reset ===');
      await new Promise(resolve => setTimeout(resolve, 65000));

      // Step 1: Test endpoint works BEFORE rate limit
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

      console.log(`1. Works before: ${canHitBefore ? '✅' : '❌'}`);
      console.log(`2. Has rate limit: ${analysis.rateLimited ? '✅' : '❌'}`);
      console.log(`3. Same blocked: ${!canHitAfter ? '✅' : '❌'}`);

      expect(canHitBefore).toBe(true);
      expect(analysis.rateLimited).toBe(true);
    });
  }
});