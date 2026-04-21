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

export const defaultUsers: Record<string, UserCredentials> = {
  eiji: {
    email: 'eiji',
    password: '0897421942@Earth',
    totp: '954900',
  },
  eiji2: {
    email: 'eiji2',
    password: '0897421942@Earth',
    totp: '954900',
  },
  eiji3: {
    email: 'eiji3',
    password: '0897421942@Earth',
    totp: '954900',
  },
  eiji4: {
    email: 'eiji4',
    password: '0897421942@Earth',
    totp: '954900',
  },
  admintest: {
    email: 'admintest',
    password: '0897421942@Earth',
  },
  superadmin: {
    email: 'superadmin_eiji',
    password: '0897421942@Earth',
    totp: '954900',
  },
};

export function getApiBaseUrl(): string {
  return process.env.API_BASE_URL || environments.sit.apiBaseUrl;
}

export function getBoApiBaseUrl(): string {
  return process.env.BO_API_BASE_URL || environments.sit.boApiBaseUrl;
}

export function getWebUrl(): string {
  return process.env.WEB_URL || environments.sit.webUrl;
}