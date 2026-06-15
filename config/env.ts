/**
 * Environment Configuration
 * Centralized environment URLs and settings
 */

export const environments = {
  sit: {
    apiBaseUrl: 'https://api-sit.askmebill.com',
    boApiBaseUrl: 'https://apixint-sit.askmebill.com',
    webUrl: 'https://sit.askmebill.com',
  },
  staging: {
    apiBaseUrl: 'https://api-stg.askmebill.com',
    boApiBaseUrl: 'https://apixstg.askmebill.com',
    webUrl: 'https://stg.askmebill.com',
  },
  production: {
    apiBaseUrl: 'https://api.askmebill.com',
    boApiBaseUrl: 'https://api.askmebill.com',
    webUrl: 'https://www.askmebill.com',
  },
};

export interface UserCredentials {
  email: string;
  password: string;
  totp?: string;
}

// Test credentials come from environment variables only (see .env.example).
// The previous hardcoded `defaultUsers` map was removed to avoid committing secrets.

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || environments.sit.apiBaseUrl;
}

export function getBoApiBaseUrl(): string {
  return process.env.BO_API_BASE_URL || environments.sit.boApiBaseUrl;
}

export function getWebUrl(): string {
  return process.env.WEB_URL || environments.sit.webUrl;
}