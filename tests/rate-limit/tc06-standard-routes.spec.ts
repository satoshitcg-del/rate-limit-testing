import { test, expect } from '@playwright/test';
import { burstTest, analyzeRateLimitResults, TC06_USERS, getFreshToken, clearRateLimitForUser } from '../helpers/rate-limit-analyzer';
import { getApiBaseUrl } from '../../config/env';

const baseURL = getApiBaseUrl();

/**
 * Get an "other" endpoint with the same path prefix for shared counter testing
 */
function getOtherEndpoint(userEndpoints: string[], currentEndpoint: string): string {
  // Find an endpoint in the same user's list that has the same path prefix
  const currentPrefix = currentEndpoint.split('/').slice(0, 5).join('/') + '/';

  for (const ep of userEndpoints) {
    if (ep !== currentEndpoint) {
      const epPrefix = ep.split('/').slice(0, 5).join('/') + '/';
      if (epPrefix === currentPrefix) {
        return ep;
      }
    }
  }

  // Fallback: return first endpoint in list (same prefix)
  return userEndpoints.find(e => e !== currentEndpoint) || currentEndpoint;
}

test.describe('TC-06: Standard Routes Rate Limit (60 req/min)', () => {
  for (const user of TC06_USERS) {
    test.describe(`${user.name} - ${user.email}`, () => {
      for (let i = 0; i < user.endpoints.length; i++) {
        const endpoint = user.endpoints[i];
        test(`TC-06: ${endpoint}`, async () => {
          test.setTimeout(300000);
          const OTHER_ENDPOINT = getOtherEndpoint(user.endpoints, endpoint);
          console.log(`\n========== Testing: ${endpoint} (${user.name}) ==========`);
          console.log(`[DEBUG] Other endpoint for shared counter: ${OTHER_ENDPOINT}`);

          const token = await getFreshToken(user.email, user.password, user.totp);
          if (!token) throw new Error('Failed to obtain token');
          console.log(`[DEBUG] Token obtained: ${!!token}`);

          await clearRateLimitForUser(user.email);

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

          const otherResult = await burstTest({
            baseURL,
            endpoint: OTHER_ENDPOINT,
            method: 'GET',
            token,
            burstSize: 3,
          });

          console.log(`[DEBUG] Other endpoint results:`, otherResult.map(r => r.statusCode));
          const otherHas429 = otherResult.some(r => r.statusCode === 429);
          console.log(`Other blocked: ${otherHas429 ? '✅' : '❌'}`);

          expect(canHitBefore).toBe(true);
          expect(analysis.rateLimited).toBe(true);
          expect(otherHas429).toBe(true);
        });
      }
    });
  }
});