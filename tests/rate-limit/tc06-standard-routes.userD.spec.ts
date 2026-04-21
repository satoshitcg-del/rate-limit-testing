import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

test.describe('TC-06: Standard Routes Rate Limit - User D (4-6)', () => {
  test.setTimeout(300000);
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL_D || 'eiji3',
    password: process.env.AUTH_PASSWORD_D || '0897421942@Earth',
  };

  let token: string | undefined;

  test.beforeAll(async () => {
    const workerIndex = test.info()?.workerIndex ?? 0;
    await new Promise(r => setTimeout(r, workerIndex * 15000));

    const loginData = await authClient.signIn(credentials);
    token = loginData?.data?.token;
    if (token) {
      const totpKey = process.env.AUTH_2FA || '954900';
      const totpResp = await authClient.verifyTotp(token, totpKey, true);
      if (totpResp?.data?.token) {
        token = totpResp.data.token;
      }
    }
    console.log(`[DEBUG] Token obtained for: ${credentials.email} (worker ${workerIndex})`);
  });

  const endpoints = [
    '/v1/md/billing-note/customer-export-all/ALL',
    '/v1/md/billing-note/customer-export-all/UNPAID',
    '/v1/md/billing-note/customer?status=UNPAID',
  ];

  for (const endpoint of endpoints) {
    test(`TC-06: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);
      await new Promise(resolve => setTimeout(resolve, 65000));

      const initialResult = await burstTest({
        baseURL,
        endpoint,
        method: 'GET',
        token,
        burstSize: 5,
      });

      const canHitBefore = initialResult.some(r => r.statusCode === 200);
      console.log(`Can hit before: ${canHitBefore ? '✅' : '❌'}`);

      const burstResult = await burstTest({
        baseURL,
        endpoint,
        method: 'GET',
        token,
        burstSize: 100,
      });

      const analysis = analyzeRateLimitResults(burstResult);
      console.log(`Rate limited: ${analysis.rateLimited ? '✅' : '❌'}, at: ${analysis.rateLimitedAt || 'N/A'}`);

      const sameResult = await burstTest({
        baseURL,
        endpoint,
        method: 'GET',
        token,
        burstSize: 3,
      });

      const canHitAfter = sameResult.some(r => r.statusCode === 200);
      console.log(`Same blocked: ${!canHitAfter ? '✅' : '❌'}`);

      const otherEndpoint = '/v1/md/customer/sub-accounts?page=1&limit=25';
      const otherResult = await burstTest({
        baseURL,
        endpoint: otherEndpoint,
        method: 'GET',
        token,
        burstSize: 3,
      });

      const otherHas429 = otherResult.some(r => r.statusCode === 429);
      console.log(`Other blocked: ${otherHas429 ? '✅' : '❌'}`);

      expect(canHitBefore).toBe(true);
      expect(analysis.rateLimited).toBe(true);
      expect(otherHas429).toBe(true);
    });
  }
});