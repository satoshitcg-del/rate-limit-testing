import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/rate-limit',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
      testMatch: [
        '**/tc01-auth-signin.spec.ts',
        '**/tc02-window-reset.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      workers: 1,
    },
    {
      name: 'chromium',
      testMatch: [
        '**/tc04-payment-verify.spec.ts',
        '**/tc05-user-isolation.spec.ts',
        '**/tc06-*.spec.ts',
        '**/tc07-response-format.spec.ts',
        '**/tc08-admin-exempt.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      workers: 12,  // 12 workers = 12 users พอดี (C-L)
    },
  ],
});