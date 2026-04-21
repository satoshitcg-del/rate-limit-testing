/**
 * Custom Fixtures for API Testing
 * Provides authenticated request contexts
 */

import { test as base, request as playwrightRequest } from '@playwright/test';
import { authClient, AuthClient } from '../api/auth.client';
import { getApiBaseUrl } from '../config/env';

export interface AuthenticatedPage {
  request: any;
  auth: AuthClient;
  token: string;
}

export interface TestUser {
  email: string;
  password: string;
  totp?: string;
}

/**
 * Creates an authenticated API context
 */
async function createAuthenticatedContext(
  baseURL: string,
  credentials: TestUser
): Promise<{ request: any; token: string }> {
  const ctx = await playwrightRequest.newContext({
    baseURL,
  });

  // Get token
  const token = await authClient.getTokenWithTotp(credentials);

  return { request: ctx, token };
}

/**
 * Fixture for authenticated API testing
 */
export const authenticatedFixture = base.extend<{ apiAsUser: AuthenticatedPage }>({
  async apiAsUser({}, use) {
    const baseURL = getApiBaseUrl();
    const credentials = {
      email: process.env.AUTH_EMAIL || 'eiji',
      password: process.env.AUTH_PASSWORD || '0897421942@Earth',
      totp: process.env.AUTH_2FA || '954900',
    };

    const { request, token } = await createAuthenticatedContext(baseURL, credentials);

    await use({
      request,
      auth: authClient,
      token,
    });

    await request.dispose();
  },
});

/**
 * Fixture for custom user authentication
 */
export const userFixture = base.extend<{ apiAs: (email: string) => Promise<AuthenticatedPage> }>({
  async apiAs(email, use) {
    const baseURL = getApiBaseUrl();
    const emailKey = email.replace('@', '').toUpperCase();

    const credentials = {
      email: process.env[`AUTH_EMAIL_${emailKey}`] || email,
      password: process.env[`AUTH_PASSWORD_${emailKey}`] || '0897421942@Earth',
      totp: process.env.AUTH_2FA || '954900',
    };

    const { request, token } = await createAuthenticatedContext(baseURL, credentials);

    await use(async () => {
      return { request, auth: authClient, token };
    });

    await request.dispose();
  },
});