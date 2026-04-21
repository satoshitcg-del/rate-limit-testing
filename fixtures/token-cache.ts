import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface CachedToken {
  email: string;
  token: string;
  refreshToken: string;
  expiresAt: number;
  needsTotp: boolean;
}

interface TokenCache {
  version: number;
  createdAt: number;
  users: Record<string, CachedToken>;
}

const CACHE_FILE = path.join(__dirname, 'tokens.json');

export function loadTokenCache(): TokenCache {
  if (!fs.existsSync(CACHE_FILE)) {
    return { version: 1, createdAt: Date.now(), users: {} };
  }
  const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
  return JSON.parse(raw) as TokenCache;
}

export function getTokenForUser(cache: TokenCache, userKey: string): string | null {
  const user = cache.users[userKey];
  if (!user) return null;

  if (Date.now() > user.expiresAt - 60000) {
    console.warn(`[token-cache] Token for ${userKey} expired or expiring soon`);
    return null;
  }

  return user.token;
}

export function getAllTokenEntries(cache: TokenCache): Array<{ key: string; token: CachedToken }> {
  return Object.entries(cache.users).map(([key, token]) => ({ key, token }));
}