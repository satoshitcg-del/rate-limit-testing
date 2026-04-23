/**
 * Auth API Client
 * Handles authentication endpoints
 */

import { getApiBaseUrl, getBoApiBaseUrl } from '../config/env';

// API Endpoints (centralized)
export const API_ENDPOINTS = {
  // Auth endpoints
  SIGN_IN: '/v1/md/auth/customer/sign-in',
  VERIFY: '/v1/md/auth/customer/verify',
  TOTP_VERIFY: '/v1/md/auth/verify/totp',
  REFRESH_TOKEN: '/v1/md/auth/customer/refresh-token',
  BO_SIGN_IN: '/v1/auth/sign-in',
  BO_VERIFY: '/v1/auth/verify',
  CLEAR_RATELIMIT: '/v1/system/clear-ratelimit',
} as const;

export type Endpoint = typeof API_ENDPOINTS[keyof typeof API_ENDPOINTS];

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignInResponse {
  code: number;
  message: string;
  data: {
    token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export interface TotpVerifyRequest {
  totp_key: string;
  generate_token?: boolean;
}

export class AuthClient {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || getApiBaseUrl();
  }

  async signIn(credentials: SignInRequest): Promise<SignInResponse> {
    const response = await fetch(`${this.baseURL}${API_ENDPOINTS.SIGN_IN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    return response.json();
  }

  async verifyTotp(token: string, totpKey: string, generateToken = true): Promise<any> {
    const response = await fetch(`${this.baseURL}${API_ENDPOINTS.TOTP_VERIFY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ totp_key: totpKey, generate_token: generateToken }),
    });

    return response.json();
  }

  async refreshToken(refreshToken: string): Promise<any> {
    const response = await fetch(`${this.baseURL}${API_ENDPOINTS.REFRESH_TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    return response.json();
  }

  async boSignIn(email: string, password: string): Promise<any> {
    const response = await fetch(`${getBoApiBaseUrl()}${API_ENDPOINTS.BO_VERIFY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    return response.json();
  }

  async clearRateLimit(username?: string, ip?: string): Promise<any> {
    const response = await fetch(`${getBoApiBaseUrl()}${API_ENDPOINTS.CLEAR_RATELIMIT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        ...(username && { username }),
        ...(ip && { ip }),
      }),
    });
    return response.json();
  }

  async getTokenWithTotp(credentials: { email: string; password: string; totp?: string }): Promise<string | null> {
    const signInResp = await this.signIn({ email: credentials.email, password: credentials.password });
    const token = signInResp?.data?.token;

    if (!token) return null;

    if (credentials.totp) {
      const totpResp = await this.verifyTotp(token, credentials.totp);
      return totpResp?.data?.token || token;
    }

    return token;
  }
}

export const authClient = new AuthClient();