import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';

/**
 * Comprehensive Rate Limit Test - User D
 */

test.describe('Comprehensive Rate Limit Test - User D', () => {
  test.setTimeout(600000);

  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';
  const credentials = {
    email: process.env.AUTH_EMAIL_D || 'eiji3',
    password: process.env.AUTH_PASSWORD_D || '0897421942@Earth',
  };

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

      const initialResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 5,
      });

      const canHitBefore = initialResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Can hit endpoint before rate limit: ${canHitBefore ? '✅ YES' : '❌ NO'}`);

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

      const otherEndpoint = '/v1/md/user/profile';
      const afterLimitResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: otherEndpoint,
        method: 'GET',
        credentials,
        burstSize: 5,
      });

      const otherEndpointBlocked = afterLimitResult.burstResults.every(r => r.statusCode === 429);
      console.log(`Other endpoint blocked: ${otherEndpointBlocked ? '✅ YES' : '⚠️ NO'}`);

      const sameEndpointResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method: 'GET',
        credentials,
        burstSize: 3,
      });

      const canHitAfter = sameEndpointResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Same endpoint blocked: ${!canHitAfter ? '✅ YES' : '❌ NO'}`);

      console.log('\n========== SUMMARY ==========');
      console.log(`1. Works before: ${canHitBefore ? '✅' : '❌'}`);
      console.log(`2. Has rate limit: ${analysis.rateLimited ? '✅' : '❌'}`);
      console.log(`3. Other blocked: ${otherEndpointBlocked ? '✅' : '⚠️'}`);
      console.log(`4. Same blocked: ${!canHitAfter ? '✅' : '❌'}`);

      expect(canHitBefore).toBe(true);
      expect(analysis.rateLimited).toBe(true);
    });
  }
});
