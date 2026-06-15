/**
 * Auth + rate-limit STATE helpers (test setup, not assertions).
 *
 * - getFreshToken()        sign-in + TOTP for a user, cached (in-memory + file), retries on rate limit
 * - refreshAccessToken()   swap a refresh_token for a new access token
 * - clearRateLimitForUser()/clearIpRateLimit()  reset counters between tests
 *
 * Token cache file: tests/helpers/token-cache.json (written by scripts/pre-auth.js / global-setup).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { authClient } from '../../api/auth.client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Real token expiry (ms epoch) from the JWT `exp` claim.
 *
 * The backend issues `exp` as a STRING in NANOSECONDS (e.g. "1781561374947766314").
 * We used to fabricate `expiresAt = now + 1h`, which LIED — the JWT often died ~30 min
 * earlier, and both cache layers then served a dead token → 401 in late specs. Decode
 * the real exp instead. Returns null if unparseable (caller uses a short fallback).
 */
export function jwtExpiryMs(token: string): number | null {
  try {
    const seg = token.split('.')[1];
    if (!seg) return null;
    const payload = JSON.parse(Buffer.from(seg, 'base64url').toString('utf-8'));
    if (payload.exp == null) return null;
    const raw = BigInt(payload.exp);
    // normalize to ms: backend uses ns (≈1e18); handle s/ms defensively too
    if (raw > 1_000_000_000_000_000n) return Number(raw / 1_000_000n); // ns → ms
    if (raw > 1_000_000_000_000n) return Number(raw); // already ms
    return Number(raw) * 1000; // s → ms
  } catch {
    return null;
  }
}

/**
 * Token cache per worker (in-memory)
 * Key: email, Value: { token, refreshToken, expiresAt }
 */
const tokenCache = new Map<string, { token: string; refreshToken?: string; expiresAt: number }>();

/**
 * Load tokens from file cache (if exists)
 */
function loadFileCache(): Record<string, string> {
  try {
    const cacheFile = path.join(__dirname, 'token-cache.json');
    if (fs.existsSync(cacheFile)) {
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const tokens: Record<string, string> = cache.tokens || {};
      // Validate each token's REAL exp — the file's `expiresAt` was historically
      // fabricated (now+1h), so trust the JWT, not the field. Keep only tokens with
      // > 1 min left; expired ones are dropped so the caller re-fetches.
      const now = Date.now();
      const fresh: Record<string, string> = {};
      for (const [email, tok] of Object.entries(tokens)) {
        const exp = jwtExpiryMs(tok);
        if (exp && exp > now + 60000) fresh[email] = tok;
      }
      if (Object.keys(fresh).length > 0) {
        console.log(`[DEBUG] Loaded ${Object.keys(fresh).length} fresh token(s) from file cache`);
        return fresh;
      }
      console.log('[DEBUG] File cache tokens expired — ignoring');
    }
  } catch (e) {
    // Ignore errors
  }
  return {};
}

/**
 * Get fresh token with TOTP for a user (cached)
 * Handles rate limit by clearing and retrying once
 */
export async function getFreshToken(email: string, password: string, totp: string): Promise<string | undefined> {
  const now = Date.now();
  const cached = tokenCache.get(email);

  // Reuse token if still valid (> 5 min remaining)
  if (cached && cached.expiresAt > now + 300000) {
    console.log(`[DEBUG] Reusing in-memory cached token for: ${email}`);
    return cached.token;
  }

  // Check file cache
  const fileTokens = loadFileCache();
  if (fileTokens[email]) {
    console.log(`[DEBUG] Reusing file cached token for: ${email}`);
    tokenCache.set(email, { token: fileTokens[email], expiresAt: jwtExpiryMs(fileTokens[email]) ?? now + 600000 });
    return fileTokens[email];
  }

  // Try to fetch new token (with rate limit retry)
  await clearIpRateLimit(); // Clear IP rate limit before attempting
  await new Promise(r => setTimeout(r, 2000)); // Brief pause after clear
  const token = await fetchTokenWithRetry(email, password, totp);
  if (!token) return undefined;

  // Cache it with the token's REAL expiry (honest — see jwtExpiryMs)
  tokenCache.set(email, { token, expiresAt: jwtExpiryMs(token) ?? now + 600000 });
  console.log(`[DEBUG] Cached new token for: ${email}`);

  return token;
}

/**
 * Fetch token with rate limit handling
 * IP-based rate limit (5 req/min) resets after 61 seconds
 * User-based rate limit can be cleared via clearRateLimitForUser
 */
async function fetchTokenWithRetry(email: string, password: string, totp: string, attempt = 1): Promise<string | undefined> {
  console.log(`[DEBUG] Fetching new token for: ${email} (attempt ${attempt})`);
  const signInData = await authClient.signIn({ email, password });

  // Check if rate limited (could be IP-based or user-based)
  if (signInData?.code === 10027 || signInData?.code === 429) {
    console.warn(`[DEBUG] Sign-in rate limited (${signInData?.code}), clearing IP rate limit...`);
    await clearIpRateLimit();

    // IP-based rate limit needs full 61s to reset - clear doesn't work for this tier
    console.warn(`[DEBUG] Waiting 65s for IP rate limit window reset...`);
    await new Promise(r => setTimeout(r, 65000));
    return fetchTokenWithRetry(email, password, totp, attempt + 1);
  }

  // Check if credential error (don't retry)
  if (!signInData?.data?.token) {
    console.warn(`[DEBUG] Credential error for ${email}: ${signInData?.message} - skipping`);
    return undefined; // Don't retry credential errors
  }

  const token = signInData.data.token;
  const refreshToken = signInData.data.refresh_token;
  const totpResp = await authClient.verifyTotp(token, totp, true);

  // Check if TOTP also got rate limited
  if (totpResp?.code === 10027 || totpResp?.code === 429) {
    console.warn(`[DEBUG] TOTP rate limited (${totpResp?.code}), clearing and retrying...`);
    await clearRateLimitForUser(email);
    await new Promise(r => setTimeout(r, 2000));
    return fetchTokenWithRetry(email, password, totp, attempt + 1);
  }

  // Require a post-2FA token. Never fall back to the pre-2FA sign-in token — APIs reject it
  // with 401, which masquerades as a test failure (token is truthy, so skip-guards pass).
  if (!totpResp?.data?.token) {
    console.warn(`[DEBUG] TOTP did not return a token for ${email} (code ${totpResp?.code}) - skipping`);
    return undefined;
  }
  return totpResp.data.token;
}

/**
 * Refresh token using refresh_token
 * Returns new access token or undefined if failed
 */
export async function refreshAccessToken(refreshToken: string): Promise<string | undefined> {
  console.log(`[DEBUG] Refreshing access token...`);
  const resp = await authClient.refreshToken(refreshToken);

  if (resp?.code === 10027 || resp?.code === 429) {
    console.warn(`[DEBUG] Refresh token rate limited (${resp?.code})`);
    return undefined;
  }

  if (resp?.data?.token) {
    console.log(`[DEBUG] Refresh token success`);
    return resp.data.token;
  }

  console.warn(`[DEBUG] Refresh token failed: ${resp?.message}`);
  return undefined;
}

/**
 * Clear rate limit for a user
 */
export async function clearRateLimitForUser(email: string): Promise<void> {
  await authClient.clearRateLimit(email);
  console.log(`[DEBUG] Cleared rate limit for: ${email}`);
}

/**
 * Clear IP-based rate limit (call without username to clear caller's IP)
 */
export async function clearIpRateLimit(): Promise<void> {
  await authClient.clearRateLimit();
  console.log(`[DEBUG] Cleared IP rate limit`);
}
