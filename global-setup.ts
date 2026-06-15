import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getFreshToken, clearIpRateLimit } from './tests/helpers/rate-limit-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, 'tests', 'helpers', 'token-cache.json');
const LOCK_FILE = path.join(__dirname, 'tests', 'helpers', 'token-cache.lock');

interface TokenCache {
  tokens: Record<string, string>;
  expiresAt: number;
}

interface UserConfig {
  key: string;
  email: string;
  password: string;
  totp: string;
}

async function waitForLock(maxWaitMs = 90000) {
  const start = Date.now();
  while (fs.existsSync(LOCK_FILE)) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error('Timeout waiting for token cache lock');
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

async function acquireLock() {
  await waitForLock();
  fs.writeFileSync(LOCK_FILE, process.pid.toString());
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}

function getUsersFromEnv(): UserConfig[] {
  const users: UserConfig[] = [];
  const totp = process.env.AUTH_2FA || '';

  // Main user (eiji) - used in TC-01, TC-02, TC-05
  if (process.env.AUTH_EMAIL) {
    users.push({
      key: 'eiji',
      email: process.env.AUTH_EMAIL,
      password: process.env.AUTH_PASSWORD || '',
      totp,
    });
  }

  // Note: admintest is NOT included because:
  // 1. It has wrong credentials in .env
  // 2. TC-05 and TC-08 call authClient.getTokenWithTotp() directly

  // User C (eiji2) — used by TC-06 + TC-10. Users D-L existed only for the old 10-user
  // TC-06 loop (now trimmed to one user) → no longer pre-fetched, saving ~9×65s of setup.
  const additionalUsers: Array<{ key: string; email: string; password: string } | null> = [
    process.env.AUTH_EMAIL_C ? { key: 'User C', email: process.env.AUTH_EMAIL_C, password: process.env.AUTH_PASSWORD_C || '' } : null,
  ];

  for (const u of additionalUsers) {
    if (u) {
      users.push({ ...u, totp });
    }
  }

  return users;
}

async function globalSetup() {
  console.log('[globalSetup] Starting...');

  // Fail-fast: credentials must come from .env (no hardcoded fallbacks)
  const requiredEnv = ['AUTH_EMAIL', 'AUTH_PASSWORD', 'AUTH_2FA'];
  const missingEnv = requiredEnv.filter((k) => !process.env[k]);
  if (missingEnv.length > 0) {
    throw new Error(
      `[globalSetup] Missing required env vars: ${missingEnv.join(', ')}. ` +
        'Copy .env.example to .env and fill in real credentials (do NOT commit .env).',
    );
  }

  // Check if cache exists and is fresh (at least 30 min remaining)
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache: TokenCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (Date.now() < cache.expiresAt - 1800000) { // 30 min buffer
        console.log('[globalSetup] Using existing token cache (still fresh)');
        return;
      }
      console.log('[globalSetup] Cache expired or expiring soon, refreshing...');
    } catch (e) {
      console.log('[globalSetup] Invalid cache file, refreshing...');
    }
  }

  // Need to fetch new tokens - acquire lock
  await acquireLock();

  try {
    // Double-check after acquiring lock (another worker might have just finished)
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const cache: TokenCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        if (Date.now() < cache.expiresAt - 1800000) {
          console.log('[globalSetup] Cache was just created by another worker');
          return;
        }
      } catch (e) {
        // Ignore, will recreate
      }
    }

    // Get all users from .env
    const allUsers = getUsersFromEnv();
    console.log(`[globalSetup] Found ${allUsers.length} users in .env`);

    // Fetch tokens sequentially with delays to avoid IP rate limit
    const tokens: Record<string, string> = {};

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      let success = false;

      for (let retry = 0; retry < 3; retry++) {
        console.log(`[globalSetup] Fetching token for ${user.email} (attempt ${retry + 1})...`);
        const token = await getFreshToken(user.email, user.password, user.totp);

        if (token) {
          tokens[user.email] = token;
          console.log(`[globalSetup] ✓ ${user.key} (${user.email}) token ready`);
          success = true;
          break;
        }

        // If failed, wait 65s for IP rate limit window to reset
        console.warn(`[globalSetup] ✗ Failed, waiting 65s for IP rate limit reset...`);
        await new Promise(r => setTimeout(r, 65000));
      }

      if (!success) {
        console.warn(`[globalSetup] ✗ Failed to get token for ${user.email} after 3 attempts - skipping`);
      }

      // 65s delay between users to avoid IP rate limit (5 req/min = 1 req per 12s, so 65s ensures window reset)
      if (i < allUsers.length - 1) {
        console.log(`[globalSetup] Waiting 65s before next user to avoid IP rate limit...`);
        await new Promise(r => setTimeout(r, 65000));
      }
    }

    // Save to file
    const cacheData: TokenCache = {
      tokens,
      expiresAt: Date.now() + 3600000, // 1 hour
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`[globalSetup] Token cache saved (${Object.keys(tokens).length} tokens)`);
  } finally {
    releaseLock();
  }
}

export default globalSetup;