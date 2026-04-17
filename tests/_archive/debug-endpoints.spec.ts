import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';

/**
 * Comprehensive Rate Limit Test
 * Tests:
 * 1. Each endpoint - can hit BEFORE rate limit (should work)
 * 2. Each endpoint - HAS rate limit? (should trigger at ~60)
 * 3. After rate limit - can hit OTHER endpoints? (shared counter)
 * 4. After rate limit - can hit SAME endpoint? (should get 429)
 */

test.describe('Comprehensive Rate Limit Test', () => {
  test.setTimeout(600000);

  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';
  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  // Wait 130s before each test for rate limit window reset
  test.beforeEach(async () => {
    console.log('\n=== Waiting 130 seconds for rate limit window to reset ===');
    await new Promise(resolve => setTimeout(resolve, 130000));
  });

  const endpoints = [
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
    '/v2/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT&page=1&limit=25',
    '/v2/md/billing-note/customer?status=PAID&page=1&limit=25',
    '/v2/md/billing-note/customer?status=EXCEED&page=1&limit=25',
    '/v2/md/billing-note/customer?status=REFUND&page=1&limit=25',
    '/v2/md/billing-note/customer?status=VOID&page=1&limit=25',
    '/v2/md/billing-note/customer?status=&page=1&limit=25',
  ];

  for (const endpoint of endpoints) {
    test(`COMPREHENSIVE: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);

      // Step 1: Test endpoint works BEFORE rate limit
      console.log('\n[Step 1] Testing endpoint works before rate limit...');
      const initialResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 5,
      });

      const initialAnalysis = analyzeRateLimitResults(initialResult.burstResults);
      console.log(`Initial 5 requests: ${initialAnalysis.totalRequests} sent`);
      console.log(`Status codes: ${initialResult.burstResults.map(r => r.statusCode).join(', ')}`);

      const canHitBefore = initialResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Can hit endpoint before rate limit: ${canHitBefore ? '✅ YES' : '❌ NO'}`);

      // Step 2: Burst to trigger rate limit
      console.log('\n[Step 2] Burst to trigger rate limit...');
      const burstResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 100,
      });

      const analysis = analyzeRateLimitResults(burstResult.burstResults);

      console.log(`Total requests sent: ${analysis.totalRequests}`);
      console.log(`Rate limited: ${analysis.rateLimited ? '✅ YES' : '❌ NO'}`);
      console.log(`Rate limited at: ${analysis.rateLimitedAt || 'N/A'}`);
      console.log(`Last status: ${burstResult.burstResults[burstResult.burstResults.length - 1]?.statusCode}`);

      // Step 3: After rate limit, can hit OTHER endpoints?
      console.log('\n[Step 3] Testing OTHER endpoint after rate limit...');
      const otherEndpoint = '/v1/md/user/profile';
      const afterLimitResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: otherEndpoint,
        method: 'GET',
        credentials,
        burstSize: 5,
      });

      const afterLimitAnalysis = analyzeRateLimitResults(afterLimitResult.burstResults);
      console.log(`Other endpoint status codes: ${afterLimitResult.burstResults.map(r => r.statusCode).join(', ')}`);

      const otherEndpointBlocked = afterLimitResult.burstResults.every(r => r.statusCode === 429);
      const otherEndpointAllowed = afterLimitResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Other endpoint: ${otherEndpointBlocked ? '❌ ALL 429 (shared counter)' : otherEndpointAllowed ? '✅ Some 200 (not shared)' : '⚠️ Mixed'}`);

      // Step 4: After rate limit, can still hit SAME endpoint?
      console.log('\n[Step 4] Testing SAME endpoint after rate limit...');
      const sameEndpointResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 3,
      });

      const sameEndpointAnalysis = analyzeRateLimitResults(sameEndpointResult.burstResults);
      console.log(`Same endpoint after limit: ${sameEndpointResult.burstResults.map(r => r.statusCode).join(', ')}`);

      const canHitAfter = sameEndpointResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Can hit same endpoint after rate limit: ${canHitAfter ? '❌ YES (bug)' : '✅ NO (correct - 429)'}`);

      // Summary
      console.log('\n========== SUMMARY ==========');
      console.log(`Endpoint: ${endpoint}`);
      console.log(`1. Works before rate limit: ${canHitBefore ? '✅ YES' : '❌ NO'}`);
      console.log(`2. Has rate limit: ${analysis.rateLimited ? '✅ YES (at ' + analysis.rateLimitedAt + ')' : '❌ NO (BUG!)'}`);
      console.log(`3. Other endpoints blocked: ${otherEndpointBlocked ? '✅ YES (shared)' : '⚠️ NO (separate)'}`);
      console.log(`4. Same endpoint blocked: ${!canHitAfter ? '✅ YES (correct)' : '❌ NO (bug)'}`);

      // Assertions
      expect(canHitBefore, 'Endpoint should work before rate limit').toBe(true);
      expect(analysis.rateLimited, `Endpoint ${endpoint} should have rate limit`).toBe(true);
    });
  }
});
