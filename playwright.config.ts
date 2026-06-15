import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/rate-limit',
  // Rate-limit tests share counters (same user / one machine IP) + time windows.
  // They are inherently stateful → must run serially, else parallel runs contend and flake.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['html'], ['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.API_BASE_URL || 'https://api-sit.askmebill.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 60000,
  projects: [
    {
      name: 'auth-burst',
      testMatch: ['**/tc01-auth-signin.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      testMatch: [
        '**/tc04-payment-verify.spec.ts',
        '**/tc05-user-isolation.spec.ts',
        '**/tc06-*.spec.ts',
        '**/tc07-response-format.spec.ts',
        '**/tc08-admin-exempt.spec.ts',
        '**/tc10-*.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});