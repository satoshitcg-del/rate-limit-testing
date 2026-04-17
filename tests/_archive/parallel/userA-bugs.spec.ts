import { test, expect } from '@playwright/test';
import { loginAndBurstTest, analyzeRateLimitResults } from '../../helpers/rate-limit-analyzer';

/**
 * Rate Limit Test - User A (Endpoints with BUGs)
 */

test.describe('Rate Limit Test - User A (Bug Investigation)', () => {
  test.setTimeout(600000);

  const baseURL = process.env.API_BASE_URL || 'https://api-sit.askmebill.com';
  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
  };

  const endpoints = [
    { endpoint: '/v1/md/system-file/invoice/slip', method: 'POST' as const, upload: true },
    '/v1/md/billing-note/customer-export/69d4e2fe76faf342bd4a6322',
    '/v1/md/billing-note/preview/69d4e2fe76faf342bd4a6322',
  ];

  for (const item of endpoints) {
    const endpoint = typeof item === 'string' ? item : item.endpoint;
    const method = typeof item === 'string' ? 'GET' as const : item.method;
    const isUpload = typeof item !== 'string' && item.upload;

    test(`RATE LIMIT: ${endpoint} (${method})`, async () => {
      console.log(`\n========== Testing: ${endpoint} (${method}) ==========`);
      console.log('=== Waiting 65 seconds for rate limit window to reset ===');
      await new Promise(resolve => setTimeout(resolve, 65000));

      const testFilePath = `tests/fixtures/testimg.jpg`;

      // Step 1: Test endpoint works BEFORE rate limit
      const initialResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method,
        credentials,
        burstSize: 5,
        ...(isUpload && { uploadFile: { path: testFilePath, fieldName: 'file' } }),
      });

      const canHitBefore = initialResult.burstResults.some(r => r.statusCode === 200);
      console.log(`Can hit before: ${canHitBefore ? '✅' : '❌'}`);
      console.log(`Status codes: ${initialResult.burstResults.map(r => r.statusCode).join(', ')}`);

      // Step 2: Burst to trigger rate limit
      const burstResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method,
        credentials,
        burstSize: 100,
        ...(isUpload && { uploadFile: { path: testFilePath, fieldName: 'file' } }),
      });

      const analysis = analyzeRateLimitResults(burstResult.burstResults);

      console.log(`Rate limited: ${analysis.rateLimited ? '✅ YES' : '❌ NO'}`);
      console.log(`Rate limited at: ${analysis.rateLimitedAt || 'N/A'}`);

      // Step 3: After rate limit, can hit SAME endpoint?
      const sameEndpointResult = await loginAndBurstTest({
        baseURL,
        loginEndpoint: '/v1/md/auth/customer/sign-in',
        targetEndpoint: endpoint,
        method,
        credentials,
        burstSize: 3,
        ...(isUpload && { uploadFile: { path: testFilePath, fieldName: 'file' } }),
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