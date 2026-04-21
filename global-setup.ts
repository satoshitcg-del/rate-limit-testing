import { authClient } from './api/auth.client.js';
import { defaultUsers } from './config/env.js';
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

const CACHE_FILE = path.join(__dirname, 'fixtures', 'tokens.json');

async function preAuthenticateAllUsers(): Promise<void> {
  // Delete stale cache first
  if (fs.existsSync(CACHE_FILE)) {
    fs.unlinkSync(CACHE_FILE);
  }

  const users: Record<string, CachedToken> = {};
  const userKeys = Object.keys(defaultUsers);

  for (let i = 0; i < userKeys.length; i++) {
    const key = userKeys[i];
    const creds = defaultUsers[key];
    console.log(`[globalSetup] Pre-authenticating ${i + 1}/${userKeys.length}: ${creds.email}`);

    let success = false;
    for (let retry = 0; retry < 5; retry++) {
      try {
        const resp = await authClient.signIn({ email: creds.email, password: creds.password });
        const token = resp?.data?.token;

        if (token) {
          let finalToken = token;
          if (creds.totp) {
            await new Promise(r => setTimeout(r, 1000));
            const totpResp = await authClient.verifyTotp(token, creds.totp, true);
            finalToken = totpResp?.data?.token || finalToken;
          }

          users[key] = {
            email: creds.email,
            token: finalToken,
            refreshToken: resp?.data?.refresh_token || '',
            expiresAt: Date.now() + (resp?.data?.expires_in || 3600) * 1000,
            needsTotp: !!creds.totp,
          };
          success = true;
          console.log(`[globalSetup] ✓ ${creds.email} authenticated`);
          break;
        }

        // If rate limited, wait and retry
        const isRateLimited = resp?.code === 10027 || resp?.code === 429;
        if (isRateLimited) {
          const waitMs = Math.min(30000, (retry + 1) * 10000);
          console.log(`[globalSetup] Rate limited for ${creds.email}, waiting ${waitMs}ms...`);
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.warn(`[globalSetup] Sign-in failed for ${creds.email}: ${resp?.message}`);
          break;
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[globalSetup] Error for ${creds.email}: ${message}, retrying...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (!success) {
      console.warn(`[globalSetup] ✗ Failed to authenticate ${creds.email} after retries`);
    }

    // Stagger between users to avoid burst
    if (i < userKeys.length - 1) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const cache: TokenCache = {
    version: 1,
    createdAt: Date.now(),
    users,
  };

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`[globalSetup] Token cache written to ${CACHE_FILE}`);
}

export default preAuthenticateAllUsers;