import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

test.describe('TC-06: Standard Routes Rate Limit - User F (10-12)', () => {
  test.setTimeout(300000);
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL_F || 'eiji9',
    password: process.env.AUTH_PASSWORD_F || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
  };

  async function getFreshToken(): Promise<string | undefined> {
    const signInData = await authClient.signIn({ email: credentials.email, password: credentials.password });
    const token = signInData?.data?.token;
    if (!token) return undefined;
    const totpResp = await authClient.verifyTotp(token, credentials.totp, true);
    return totpResp?.data?.token || token;
  }

  async function clearRateLimitForUser(): Promise<void> {
    await authClient.clearRateLimit(credentials.email);
    console.log(`[DEBUG] Cleared rate limit for: ${credentials.email}`);
  }

  const endpoints = [
    '/v1/md/billing-note/customer?status=PAID',
    '/v1/md/billing-note/customer?status=PARTIALPAID,DELIVERED,VERIFYPAYMENT',
    '/v1/md/billing-note/customer?status=EXCEED',
  ];

  for (const endpoint of endpoints) {
    test(`TC-06: ${endpoint}`, async () => {
      console.log(`\n========== Testing: ${endpoint} ==========`);

      const token = await getFreshToken();
      if (!token) throw new Error('Failed to obtain token');
      console.log(`[DEBUG] Token obtained: ${!!token}`);

      await clearRateLimitForUser();

      const initialResult = await burstTest({
        baseURL,
        endpoint,
        method: 'GET',
        token,
        burstSize: 5,
      });

      const canHitBefore = initialResult.some(r => r.statusCode === 200);
      console.log(`Can hit before: ${canHitBefore ? '✅' : '❌'}`);

      await clearRateLimitForUser();

      const burstResult = await burstTest({
        baseURL,
        endpoint,
        method: 'GET',
        token,
        burstSize: 200,
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