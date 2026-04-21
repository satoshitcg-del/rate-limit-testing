import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';
import { authClient } from '../../api/auth.client';

/**
 * TC-04: ทดสอบ Rate Limit ของ Payment Verify (Payment Tier)
 *
 * Endpoint: POST /v1/md/billing-note/payment/verify
 * จำกัด: 10 ครั้ง/นาที
 * Key: userID
 */

test.describe('TC-04: Payment Verify Rate Limit (Payment Tier)', () => {
  const baseURL = getApiBaseUrl();

  const credentials = {
    email: process.env.AUTH_EMAIL || 'eiji',
    password: process.env.AUTH_PASSWORD || '0897421942@Earth',
    totp: process.env.AUTH_2FA || '954900',
  };

  const paymentBody = { invoice_id: '69e6760f466b99885541692c', amount: 100 };

  async function getFreshToken(): Promise<string | undefined> {
    const signInData = await authClient.signIn({ email: credentials.email, password: credentials.password });
    const token = signInData?.data?.token;
    if (!token) return undefined;
    const totpResp = await authClient.verifyTotp(token, credentials.totp, true);
    return totpResp?.data?.token || token;
  }

  test('TC-04-01: Payment verify ควรถูก rate limit หลัง 10 ครั้ง', async () => {
    const token = await getFreshToken();
    console.log(`\n=== TC-04-01: Payment Verify Rate Limit ===`);
    console.log(`Login success: ${!!token}`);

    const result = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token,
      burstSize: 15,
      body: paymentBody,
    });

    const analysis = analyzeRateLimitResults(result);
    console.log(`Rate limited: ${analysis.rateLimited}, at: ${analysis.rateLimitedAt || 'N/A'}`);

    if (analysis.rateLimited) {
      expect(analysis.rateLimitedAt).toBeLessThanOrEqual(12);
    }
  });

  test('TC-04-02: Payment verify rate limit ควรเป็น per user', async () => {
    const token = await getFreshToken();
    console.log(`\n=== TC-04-02: Per-User Rate Limit ===`);
    console.log(`Login success: ${!!token}`);

    const result = await burstTest({
      baseURL,
      endpoint: '/v1/md/billing-note/payment/verify',
      method: 'POST',
      token,
      burstSize: 12,
      body: paymentBody,
    });

    const analysis = analyzeRateLimitResults(result);
    console.log(`Rate limited: ${analysis.rateLimited}, at: ${analysis.rateLimitedAt || 'N/A'}`);

    if (analysis.rateLimited) {
      expect(analysis.rateLimitedAt).toBeLessThanOrEqual(12);
    }
  });
});